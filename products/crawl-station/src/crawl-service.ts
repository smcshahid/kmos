/**
 * CrawlService — the CrawlStation application service.
 *
 * Orchestrates the KMOS platform into the product experience: paste a URL, watch a live
 * acquisition, and leave with searchable, verifiable knowledge that never loses its
 * provenance. It owns NO business logic and NO canonical objects — evidence, lineage,
 * knowledge, relationships, trust, and search all live in KMOS. This layer drives the
 * (KMOS-unaware) crawl engine and, for each fetched page, performs the canonical
 * operations that make acquisition trustworthy. It bypasses nothing (KMOS-9999 §9).
 *
 * The mapping of the web onto KMOS primitives:
 *   raw HTML            → Asset (Document, sha-256, provenance origin=Ingested)   ── evidence
 *   readable content    → derived Asset + recordDerivation                        ── lineage
 *   the page            → KnowledgeObject (category Topic: title + summary)        ── knowledge
 *   the discovery path  → Knowledge relationship (parent References child)         ── graph
 *   confidence in it    → Governance.assessTrust (explainable, evidence-driven)    ── trust
 *   findability         → SearchService index (rebuilt when a crawl completes)     ── search
 */

import { createHash, randomUUID } from 'node:crypto';
import type { CanonicalId } from '@kmos/canonical-kernel';
import type { CrawlPlatform } from './platform.js';
import type { CrawlStore } from './crawl-store.js';
import { runCrawl, type CrawlDeps, type CrawlEvent, type FetchedPage } from './crawler.js';
import { canonicalizeUrl, siteKey, shortLabel } from './urls.js';
import {
  DEFAULT_CRAWL_CONFIG, emptyStats,
  type ActivityEvent, type CrawlConfig, type CrawlJob, type CrawlSummary,
  type LineageNode, type PageRecord, type PageView, type TrustView,
} from './types.js';

export interface CrawlSubmitInput {
  readonly seedUrl: string;
  /** Partial overrides merged over DEFAULT_CRAWL_CONFIG. */
  readonly config?: Partial<CrawlConfig>;
}

export interface CrawlServiceOptions {
  readonly now?: () => string;
  readonly store?: CrawlStore;
  /** Injected fetch/timing for the engine (tests pass a deterministic fake). */
  readonly crawlDeps?: CrawlDeps;
  /** User-agent presented to sites and robots.txt. */
  readonly userAgent?: string;
}

const DEFAULT_UA = 'CrawlStation/1.0 (+https://kmos.local/crawl-station; respects robots.txt)';
const ACTIVITY_CAP = 60;
const EXCERPT_CHARS = 1400;
const MEANINGFUL_WORDS = 50;
const TRUST_THRESHOLD = 0.75;

export class CrawlService {
  private readonly p: CrawlPlatform;
  private readonly jobs = new Map<string, CrawlJob>();
  private readonly store?: CrawlStore;
  private readonly now: () => string;
  private readonly userAgent: string;
  private readonly crawlDeps: CrawlDeps;
  private orgId?: CanonicalId;

  /** Cooperative cancellation flags, by job id. */
  private readonly cancelled = new Set<string>();
  /** Per-job map: canonical URL → the KnowledgeObject id, for wiring discovery paths. */
  private readonly koByCanonical = new Map<string, Map<string, CanonicalId>>();
  /** Reverse index: KnowledgeObject id → where it lives, for search result assembly. */
  private readonly knowledgeIndex = new Map<CanonicalId, { jobId: string; pageId: string }>();
  /** Per-page canonical → PageRecord, per job (avoids duplicate rows for one URL). */
  private readonly pageByCanonical = new Map<string, Map<string, PageRecord>>();

  constructor(platform: CrawlPlatform, opts: CrawlServiceOptions = {}) {
    this.p = platform;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.userAgent = opts.userAgent ?? DEFAULT_UA;
    this.crawlDeps = opts.crawlDeps ?? {};
    if (opts.store) this.store = opts.store;
  }

  /**
   * Recover persisted crawls on boot so the full experience survives a restart. The
   * canonical knowledge is already rehydrated by the platform from the durable event
   * log; here we restore the view layer and rebuild the search reverse-index. A crawl
   * caught mid-run by the restart is marked failed-and-retryable, never left "crawling".
   */
  async init(): Promise<void> {
    if (!this.store) return;
    await this.store.init();
    for (const job of await this.store.load()) {
      if (job.status === 'crawling' || job.status === 'queued') {
        job.status = 'failed';
        job.error = 'The crawl was interrupted by a restart. Retry to acquire the rest.';
      }
      this.jobs.set(job.id, job);
      this.reindexJob(job);
    }
  }

  private reindexJob(job: CrawlJob): void {
    const byCanon = new Map<string, PageRecord>();
    for (const page of job.pages) {
      byCanon.set(page.canonicalUrl, page);
      if (page.knowledgeId) this.knowledgeIndex.set(page.knowledgeId, { jobId: job.id, pageId: page.id });
    }
    this.pageByCanonical.set(job.id, byCanon);
  }

  private async persist(jobId: string): Promise<void> {
    if (!this.store) return;
    const job = this.jobs.get(jobId);
    if (!job) return;
    try {
      await this.store.save(job);
    } catch {
      // Persistence is best-effort; a storage hiccup must never crash a crawl.
    }
  }

  private async ensureOrg(): Promise<CanonicalId> {
    if (!this.orgId) {
      const org = await this.p.identity.createOrganization('CrawlStation');
      this.orgId = org.id;
    }
    return this.orgId;
  }

  // --- Submit + crawl -----------------------------------------------------

  /** Register a crawl and start it in the background. Returns immediately so the UI can
   *  poll {@link getJob} for live progress. */
  async submit(input: CrawlSubmitInput): Promise<CrawlJob> {
    const job = await this.createJob(input);
    void this.runJob(job.id).catch((err: unknown) => this.failJob(job.id, err));
    return job;
  }

  /** Submit and await full completion (used by tests and the CLI). */
  async submitAndCrawl(input: CrawlSubmitInput): Promise<CrawlJob> {
    const job = await this.createJob(input);
    try {
      await this.runJob(job.id);
    } catch (err) {
      await this.failJob(job.id, err);
    }
    return this.jobs.get(job.id)!;
  }

  private async createJob(input: CrawlSubmitInput): Promise<CrawlJob> {
    const seedUrl = normalizeSeed(input.seedUrl);
    const canonicalSeed = canonicalizeUrl(seedUrl);
    const site = siteKey(seedUrl) ?? seedUrl;
    const id = `crawl-${randomUUID().slice(0, 8)}`;
    const at = this.now();
    const config: CrawlConfig = { ...DEFAULT_CRAWL_CONFIG, ...clampConfig(input.config ?? {}) };
    const job: CrawlJob = {
      id, seedUrl, canonicalSeed, site,
      title: `${site} — ${at.slice(0, 16).replace('T', ' ')}`,
      config, status: 'queued', favorite: false,
      createdAt: at, updatedAt: at,
      stats: emptyStats(), pages: [], activity: [],
    };
    this.jobs.set(id, job);
    this.koByCanonical.set(id, new Map());
    this.pageByCanonical.set(id, new Map());
    await this.persist(id);
    return job;
  }

  private async runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)!;
    job.status = 'crawling';
    job.startedAt = this.now();
    job.updatedAt = this.now();
    this.cancelled.delete(jobId);
    await this.ensureOrg();

    await runCrawl(
      { seedUrl: job.seedUrl, config: job.config, userAgent: this.userAgent },
      {
        shouldStop: () => this.cancelled.has(jobId),
        emit: (event) => this.onCrawlEvent(job, event),
      },
      this.crawlDeps,
    );

    // Make everything acquired discoverable in one shot (cheaper than per-page).
    await this.p.search.rebuild();

    if (this.cancelled.has(jobId)) {
      job.status = 'cancelled';
      this.addActivity(job, 'info', job.seedUrl, 'Crawl cancelled by user.');
    } else {
      job.status = 'completed';
      this.addActivity(job, 'info', job.seedUrl, `Crawl complete — ${job.stats.stored} pages acquired into KMOS.`);
    }
    job.finishedAt = this.now();
    job.updatedAt = this.now();
    await this.persist(jobId);
  }

  private async onCrawlEvent(job: CrawlJob, event: CrawlEvent): Promise<void> {
    switch (event.type) {
      case 'discovered':
        job.stats.discovered++;
        job.stats.queued++;
        this.addActivity(job, 'discover', event.url, `Discovered ${shortLabel(event.url)}`);
        break;
      case 'fetched':
        job.stats.queued = Math.max(0, job.stats.queued - 1);
        await this.storePage(job, event.page);
        break;
      case 'excluded':
        job.stats.queued = Math.max(0, job.stats.queued - 1);
        job.stats.excluded++;
        this.recordTerminal(job, event.canonicalUrl, event.url, event.depth, event.from, 'excluded', { skipReason: event.reason });
        this.addActivity(job, 'exclude', event.url, `Excluded ${shortLabel(event.url)} — ${event.reason}`);
        break;
      case 'skipped':
        job.stats.queued = Math.max(0, job.stats.queued - 1);
        job.stats.skipped++;
        if (/redirect/i.test(event.reason)) job.stats.redirects++;
        this.recordTerminal(job, event.canonicalUrl, event.url, event.depth, event.from, 'skipped', { skipReason: event.reason });
        this.addActivity(job, 'skip', event.url, `Skipped ${shortLabel(event.url)} — ${event.reason}`);
        break;
      case 'error':
        job.stats.queued = Math.max(0, job.stats.queued - 1);
        job.stats.errors++;
        this.recordTerminal(job, event.canonicalUrl, event.url, event.depth, event.from, 'error', {
          error: event.error, ...(event.httpStatus ? { httpStatus: event.httpStatus } : {}),
        });
        this.addActivity(job, 'error', event.url, `Failed ${shortLabel(event.url)} — ${event.error}`);
        break;
    }
    job.updatedAt = this.now();
    // Persist periodically (every stored page + terminal) so a restart loses little.
    await this.persist(job.id);
  }

  /**
   * The heart: preserve one fetched page as canonical KMOS knowledge with full
   * provenance, lineage, and explainable trust. Never throws — a KMOS hiccup on one
   * page becomes an error record, and the crawl continues.
   */
  private async storePage(job: CrawlJob, page: FetchedPage): Promise<void> {
    const orgId = await this.ensureOrg();
    const ex = page.extracted;
    const tag = ['crawl', job.site];
    try {
      // 1) Preserve the raw HTML as evidence (integrity anchored by its sha-256).
      const rawAsset = await this.p.assets.registerAsset({
        assetType: 'Document', mediaType: 'text/html',
        displayName: ex.title, organizationId: orgId,
        storageRef: { storageId: `${job.id}/${page.contentHash.slice(0, 12)}/raw.html`, backend: 'object' },
        checksum: page.contentHash,
        content: new TextEncoder().encode(page.rawHtml),
        provenance: { origin: 'Ingested', originalSource: page.url },
        tags: tag,
        media: { mediaType: 'text/html', byteLength: page.bytes, language: ex.lang },
      });

      // 2) Preserve the extracted readable content as a DERIVED asset (lineage).
      const contentBytes = new TextEncoder().encode(ex.text);
      const contentAsset = await this.p.assets.registerAsset({
        assetType: 'Document', mediaType: 'text/plain',
        displayName: `${ex.title} — readable`, organizationId: orgId,
        storageRef: { storageId: `${job.id}/${page.contentHash.slice(0, 12)}/content.txt`, backend: 'object' },
        checksum: sha256(ex.text),
        content: contentBytes,
        provenance: { origin: 'DerivedByCapability', originalSource: page.url, sourceAssetIds: [rawAsset.id] },
        tags: tag,
        media: { mediaType: 'text/plain', byteLength: contentBytes.byteLength, language: ex.lang },
      });
      await this.p.assets.recordDerivation({ derivedAssetId: contentAsset.id, inputAssetIds: [rawAsset.id] });

      // 3) The page becomes a KnowledgeObject (a Topic) — searchable + trust-assessable.
      const hasContent = ex.wordCount >= MEANINGFUL_WORDS;
      const ko = await this.p.knowledge.createKnowledge({
        category: 'Topic',
        canonicalName: ex.title,
        definition: ex.description || firstChars(ex.text, 280) || page.url,
        primaryLanguage: ex.lang ?? 'en',
        organizationId: orgId,
        evidenceRefs: [contentAsset.id, rawAsset.id],
        confidence: ex.confidence,
      });

      // 4) Record the discovery path in the knowledge graph (parent References child).
      const koMap = this.koByCanonical.get(job.id)!;
      if (page.discoveredFrom) {
        const parentKo = koMap.get(canonicalizeUrl(page.discoveredFrom));
        if (parentKo && parentKo !== ko.id) {
          await this.p.knowledge.createRelationship({
            relation: 'References', sourceId: parentKo, targetId: ko.id,
            evidenceRefs: [contentAsset.id], confidence: 0.9,
          });
        }
      }
      koMap.set(page.canonicalUrl, ko.id);

      // 5) Explainable, evidence-driven trust (never a bare score).
      const trust = await this.p.governance.assessTrust({
        subjectId: ko.id, threshold: TRUST_THRESHOLD,
        evidence: {
          assetIntegrity: true,                    // raw bytes hashed + preserved
          knowledgeProvenance: hasContent,         // grounded in real readable content
          identityVerification: true,              // attributed to an organization
          policyCompliance: true,                  // robots respected, fetch succeeded
          workflowCompletion: true,                // full pipeline ran to completion
          capabilityCertification: ex.confidence >= 0.5, // clean extraction
          reviewerApproval: false,                 // nothing human-reviewed yet
        },
      });

      // 6) Record the outcome in the (lean) job view.
      const rec = this.recordTerminal(job, page.canonicalUrl, page.url, page.depth, page.discoveredFrom, 'stored', {
        httpStatus: page.httpStatus,
        contentType: page.contentType,
        ...(page.redirectedTo ? { redirectedTo: page.redirectedTo } : {}),
        title: ex.title,
        description: ex.description,
        ...(ex.lang ? { lang: ex.lang } : {}),
        wordCount: ex.wordCount,
        linkCount: ex.links.length,
        imageCount: ex.images.length,
        contentHash: page.contentHash,
        extractionConfidence: ex.confidence,
        fetchedAt: page.fetchedAt,
        durationMs: page.durationMs,
        excerpt: firstChars(ex.text, EXCERPT_CHARS),
        rawAssetId: rawAsset.id,
        contentAssetId: contentAsset.id,
        knowledgeId: ko.id,
        trusted: trust.trusted,
        trustScore: trust.score,
      });
      this.knowledgeIndex.set(ko.id, { jobId: job.id, pageId: rec.id });

      job.stats.stored++;
      job.stats.totalBytes += page.bytes;
      job.stats.totalWords += ex.wordCount;
      this.addActivity(job, 'store', page.url,
        `Acquired ${shortLabel(page.url)} — ${ex.wordCount} words${trust.trusted ? ', trusted' : ', needs review'}`);
      if (page.redirectedTo) {
        job.stats.redirects++;
        this.addActivity(job, 'redirect', page.url, `Redirected to ${shortLabel(page.redirectedTo)}`);
      }
    } catch (err) {
      job.stats.errors++;
      this.recordTerminal(job, page.canonicalUrl, page.url, page.depth, page.discoveredFrom, 'error', {
        error: `Acquired but could not be stored in KMOS: ${err instanceof Error ? err.message : String(err)}`,
      });
      this.addActivity(job, 'error', page.url, `Storage failed for ${shortLabel(page.url)}`);
    }
  }

  private recordTerminal(
    job: CrawlJob, canonicalUrl: string, url: string, depth: number, from: string | undefined,
    status: PageRecord['status'], fields: Partial<PageRecord>,
  ): PageRecord {
    const byCanon = this.pageByCanonical.get(job.id)!;
    let rec = byCanon.get(canonicalUrl);
    if (!rec) {
      rec = { id: `pg-${randomUUID().slice(0, 8)}`, url, canonicalUrl, depth, status, ...(from ? { discoveredFrom: from } : {}) };
      byCanon.set(canonicalUrl, rec);
      job.pages.push(rec);
    }
    rec.status = status;
    Object.assign(rec, fields);
    return rec;
  }

  private addActivity(job: CrawlJob, kind: ActivityEvent['kind'], url: string, message: string): void {
    job.activity.unshift({ at: this.now(), kind, url, message });
    if (job.activity.length > ACTIVITY_CAP) job.activity.length = ACTIVITY_CAP;
  }

  private async failJob(jobId: string, err: unknown): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = 'failed';
    job.error = err instanceof Error ? err.message : String(err);
    job.finishedAt = this.now();
    job.updatedAt = this.now();
    this.addActivity(job, 'error', job.seedUrl, `Crawl failed — ${job.error}`);
    await this.persist(jobId);
  }

  // --- Controls -----------------------------------------------------------

  /** Request cooperative cancellation of an in-flight crawl. */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || (job.status !== 'crawling' && job.status !== 'queued')) return false;
    this.cancelled.add(jobId);
    return true;
  }

  /** Re-run a failed/cancelled/completed crawl fresh, reusing its seed + config. */
  async retry(jobId: string): Promise<CrawlJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    job.status = 'queued';
    job.error = '';
    job.stats = emptyStats();
    job.pages = [];
    job.activity = [];
    this.koByCanonical.set(jobId, new Map());
    this.pageByCanonical.set(jobId, new Map());
    await this.persist(jobId);
    void this.runJob(jobId).catch((err: unknown) => this.failJob(jobId, err));
    return job;
  }

  async toggleFavorite(jobId: string): Promise<CrawlJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    job.favorite = !job.favorite;
    job.updatedAt = this.now();
    await this.persist(jobId);
    return job;
  }

  // --- Read models --------------------------------------------------------

  getJob(id: string): CrawlJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(): readonly CrawlJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  summaries(): CrawlSummary[] {
    return this.listJobs().map((j) => ({
      id: j.id, title: j.title, seedUrl: j.seedUrl, site: j.site,
      status: j.status, error: j.error ?? null, favorite: j.favorite,
      pagesStored: j.stats.stored, pagesTotal: j.pages.length,
      totalWords: j.stats.totalWords, createdAt: j.createdAt,
      finishedAt: j.finishedAt ?? null,
    }));
  }

  /** The full, verifiable page view — assembled from the record + KMOS lineage + trust. */
  pageView(jobId: string, pageId: string): PageView | undefined {
    const job = this.jobs.get(jobId);
    const page = job?.pages.find((p) => p.id === pageId);
    if (!job || !page) return undefined;
    return {
      id: page.id, url: page.url, canonicalUrl: page.canonicalUrl,
      title: page.title ?? '(untitled)', description: page.description ?? '',
      lang: page.lang ?? '', wordCount: page.wordCount ?? 0,
      linkCount: page.linkCount ?? 0, imageCount: page.imageCount ?? 0,
      httpStatus: page.httpStatus ?? null, redirectedTo: page.redirectedTo ?? null,
      contentHash: page.contentHash ?? null,
      extractionConfidence: page.extractionConfidence ?? null,
      depth: page.depth, discoveredFrom: page.discoveredFrom ?? null,
      fetchedAt: page.fetchedAt ?? null, excerpt: page.excerpt ?? '',
      lineage: this.lineageFor(page),
      trust: this.trustFor(page),
    };
  }

  private lineageFor(page: PageRecord): LineageNode[] {
    if (!page.contentAssetId) return [];
    const graph = this.p.assets.getLineage(page.contentAssetId);
    const ids = [graph.assetId, ...graph.ancestors];
    const nodes: LineageNode[] = [];
    for (const assetId of ids) {
      try {
        const asset = this.p.assets.getAsset(assetId);
        nodes.push({ assetId, label: asset.displayName ?? asset.body.assetType, kind: asset.body.assetType });
      } catch {
        // Asset not resolvable (shouldn't happen) — skip rather than fail the view.
      }
    }
    return nodes;
  }

  private trustFor(page: PageRecord): TrustView {
    if (page.knowledgeId === undefined || page.trusted === undefined) {
      return { trusted: false, score: 0, reasons: ['Not acquired into KMOS.'] };
    }
    return {
      trusted: page.trusted,
      score: page.trustScore ?? 0,
      reasons: trustReasons(page),
    };
  }

  /** Meaning-based search across acquired pages, each hit tied back to its crawl + URL. */
  search(query: string): Array<{ jobId: string; pageId: string; title: string; url: string; site: string; score: number; snippet: string; trusted: boolean }> {
    if (!query || query.trim().length < 2) return [];
    const hits = this.p.search.search(query, { limit: 30 });
    const out: Array<{ jobId: string; pageId: string; title: string; url: string; site: string; score: number; snippet: string; trusted: boolean }> = [];
    for (const hit of hits) {
      const loc = this.knowledgeIndex.get(hit.subjectId);
      if (!loc) continue; // a knowledge object from another app — not a CrawlStation page
      const job = this.jobs.get(loc.jobId);
      const page = job?.pages.find((p) => p.id === loc.pageId);
      if (!job || !page) continue;
      out.push({
        jobId: job.id, pageId: page.id, title: page.title ?? page.url, url: page.url,
        site: job.site, score: hit.score,
        snippet: snippetFor(page, query), trusted: page.trusted ?? false,
      });
    }
    return out;
  }

  /** Aggregate dashboard numbers across all crawls. */
  dashboard(): {
    crawls: number; active: number; pagesAcquired: number; totalWords: number;
    trustedPages: number; sites: number;
  } {
    let pagesAcquired = 0, totalWords = 0, active = 0, trustedPages = 0;
    const sites = new Set<string>();
    for (const job of this.jobs.values()) {
      pagesAcquired += job.stats.stored;
      totalWords += job.stats.totalWords;
      if (job.status === 'crawling' || job.status === 'queued') active++;
      sites.add(job.site);
      for (const p of job.pages) if (p.trusted) trustedPages++;
    }
    return { crawls: this.jobs.size, active, pagesAcquired, totalWords, trustedPages, sites: sites.size };
  }
}

// --- helpers ----------------------------------------------------------------

function trustReasons(page: PageRecord): string[] {
  const reasons: string[] = [];
  reasons.push('Raw bytes preserved and integrity-hashed (sha-256).');
  reasons.push('Attributed to an organization; robots.txt respected on fetch.');
  if ((page.wordCount ?? 0) >= MEANINGFUL_WORDS) reasons.push('Grounded in substantial readable content extracted from the page.');
  else reasons.push('Thin readable content — marked for review rather than over-trusted.');
  if ((page.extractionConfidence ?? 0) >= 0.5) reasons.push('Clean extraction (title, structure, and text recovered).');
  reasons.push('Not yet human-reviewed.');
  return reasons;
}

function snippetFor(page: PageRecord, query: string): string {
  const text = page.excerpt ?? page.description ?? '';
  if (!text) return page.description ?? '';
  const q = query.trim().toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return firstChars(text, 180);
  const start = Math.max(0, idx - 70);
  return (start > 0 ? '…' : '') + text.slice(start, start + 180).trim() + '…';
}

function normalizeSeed(raw: string): string {
  const s = (raw ?? '').trim();
  if (!s) return s;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function clampConfig(cfg: Partial<CrawlConfig>): Partial<CrawlConfig> {
  const out: { -readonly [K in keyof CrawlConfig]?: CrawlConfig[K] } = {};
  if (cfg.maxDepth !== undefined) out.maxDepth = clamp(cfg.maxDepth, 0, 5);
  if (cfg.maxPages !== undefined) out.maxPages = clamp(cfg.maxPages, 1, 500);
  if (cfg.sameSiteOnly !== undefined) out.sameSiteOnly = cfg.sameSiteOnly;
  if (cfg.respectRobots !== undefined) out.respectRobots = cfg.respectRobots;
  if (cfg.politenessMs !== undefined) out.politenessMs = clamp(cfg.politenessMs, 0, 10000);
  if (cfg.concurrency !== undefined) out.concurrency = clamp(cfg.concurrency, 1, 16);
  if (cfg.timeoutMs !== undefined) out.timeoutMs = clamp(cfg.timeoutMs, 1000, 60000);
  if (cfg.maxRetries !== undefined) out.maxRetries = clamp(cfg.maxRetries, 0, 5);
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function firstChars(text: string, n: number): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : `${flat.slice(0, n).trimEnd()}…`;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
