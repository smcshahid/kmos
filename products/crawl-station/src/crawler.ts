/**
 * The crawl engine — a polite, depth-bounded breadth-first frontier. Pure of KMOS.
 *
 * Given a seed URL it discovers pages, honors robots.txt, spaces requests per host,
 * retries transient failures, follows redirects explicitly (so they're visible), dedups
 * by canonical URL, and extracts readable content. It knows NOTHING about KMOS: it emits
 * structured {@link CrawlEvent}s and hands each fetched+extracted page to a caller
 * callback, which is where CrawlStation preserves evidence and knowledge. The only I/O
 * is an injected `fetch`, so the whole engine runs deterministically offline in tests.
 *
 * This is the product's own acquisition logic (CrawlStation is KMOS's first
 * web-acquisition app). It stays here until a second consumer justifies promoting it to
 * a shared `@kmos/web-acquisition` capability (evidence-first extraction mandate).
 */

import { createHash } from 'node:crypto';
import { canonicalizeUrl, looksLikePage, sameSite, shortLabel, tryParseUrl } from './urls.js';
import { extractHtml, type ExtractedPage } from './extract.js';
import { parseRobots, allowAll, type RobotsRules } from './robots.js';
import type { CrawlConfig } from './types.js';

/** A page that was successfully fetched and extracted. */
export interface FetchedPage {
  readonly url: string;
  readonly canonicalUrl: string;
  readonly depth: number;
  readonly discoveredFrom?: string;
  readonly httpStatus: number;
  readonly contentType: string;
  /** Final URL when the request was redirected (else absent). */
  readonly redirectedTo?: string;
  readonly bytes: number;
  /** sha-256 hex of the raw response bytes — the integrity anchor. */
  readonly contentHash: string;
  readonly rawHtml: string;
  readonly extracted: ExtractedPage;
  readonly fetchedAt: string;
  readonly durationMs: number;
}

/** Structured outcome for one URL the frontier considered. */
export type CrawlEvent =
  | { readonly type: 'discovered'; readonly url: string; readonly canonicalUrl: string; readonly depth: number; readonly from?: string }
  | { readonly type: 'fetched'; readonly page: FetchedPage }
  | { readonly type: 'excluded'; readonly url: string; readonly canonicalUrl: string; readonly depth: number; readonly from?: string; readonly reason: string }
  | { readonly type: 'skipped'; readonly url: string; readonly canonicalUrl: string; readonly depth: number; readonly from?: string; readonly reason: string }
  | { readonly type: 'error'; readonly url: string; readonly canonicalUrl: string; readonly depth: number; readonly from?: string; readonly httpStatus?: number; readonly error: string };

export interface CrawlDeps {
  /** Injected fetch (defaults to global fetch). Tests pass a deterministic fake. */
  readonly fetchImpl?: typeof fetch;
  /** Monotonic-ish epoch ms (defaults to Date.now). */
  readonly now?: () => number;
  /** ISO timestamp (defaults to new Date().toISOString()). */
  readonly isoNow?: () => string;
  /** Sleep (defaults to real timers). Tests pass a no-op to run instantly. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface CrawlHooks {
  /** Called for every frontier event, in the order they occur. Awaited. */
  emit(event: CrawlEvent): void | Promise<void>;
  /** Cooperative cancellation — polled between units of work. */
  shouldStop?(): boolean;
}

export interface CrawlOptions {
  readonly seedUrl: string;
  readonly config: CrawlConfig;
  readonly userAgent: string;
}

const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per document
const HTML_TYPES = /(text\/html|application\/xhtml\+xml|text\/xml|application\/xml)/i;

interface FrontierItem { readonly url: string; readonly canonical: string; readonly depth: number; readonly from?: string }

/**
 * Run a crawl to completion (or cancellation). Resolves when the frontier drains or the
 * page budget is exhausted. Never throws for per-page failures — those become `error`
 * events; only a truly unexpected condition would reject.
 */
export async function runCrawl(opts: CrawlOptions, hooks: CrawlHooks, deps: CrawlDeps = {}): Promise<void> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  const isoNow = deps.isoNow ?? (() => new Date().toISOString());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const shouldStop = hooks.shouldStop ?? (() => false);
  const cfg = opts.config;

  const canonicalSeed = canonicalizeUrl(opts.seedUrl);
  const seedForScope = opts.seedUrl;

  const visited = new Set<string>([canonicalSeed]);
  const queue: FrontierItem[] = [{ url: opts.seedUrl, canonical: canonicalSeed, depth: 0 }];
  const robotsCache = new Map<string, RobotsRules>();
  const hostGate = new Map<string, number>(); // host -> earliest next-request epoch ms
  let fetchesStarted = 0;
  let active = 0;

  await hooks.emit({ type: 'discovered', url: opts.seedUrl, canonicalUrl: canonicalSeed, depth: 0 });

  async function robotsFor(origin: string, host: string): Promise<RobotsRules> {
    const cached = robotsCache.get(origin);
    if (cached) return cached;
    let rules: RobotsRules = allowAll();
    if (cfg.respectRobots) {
      try {
        const res = await withTimeout(fetchImpl, `${origin}/robots.txt`, opts.userAgent, cfg.timeoutMs, 'follow');
        if (res.ok) rules = parseRobots(await res.text(), opts.userAgent);
      } catch {
        rules = allowAll(); // no robots.txt reachable → default permissive
      }
    }
    robotsCache.set(origin, rules);
    void host;
    return rules;
  }

  async function politeWait(host: string, extraDelaySec?: number): Promise<void> {
    const delayMs = Math.max(cfg.politenessMs, Math.round((extraDelaySec ?? 0) * 1000));
    const t = now();
    const earliest = hostGate.get(host) ?? 0;
    const start = Math.max(t, earliest);
    hostGate.set(host, start + delayMs); // reserve synchronously (no await between r/w)
    const wait = start - t;
    if (wait > 0) await sleep(wait);
  }

  async function enqueueLinks(from: FetchedPage): Promise<void> {
    if (from.depth >= cfg.maxDepth) return;
    for (const link of from.extracted.links) {
      if (shouldStop()) return;
      if (!looksLikePage(link)) continue;
      if (cfg.sameSiteOnly && !sameSite(seedForScope, link)) continue;
      const canonical = canonicalizeUrl(link);
      if (visited.has(canonical)) continue;
      visited.add(canonical);
      queue.push({ url: link, canonical, depth: from.depth + 1, from: from.url });
      await hooks.emit({ type: 'discovered', url: link, canonicalUrl: canonical, depth: from.depth + 1, from: from.url });
    }
  }

  async function process(item: FrontierItem): Promise<void> {
    const parsed = tryParseUrl(item.url);
    if (!parsed) {
      await hooks.emit({ type: 'skipped', url: item.url, canonicalUrl: item.canonical, depth: item.depth, ...(item.from ? { from: item.from } : {}), reason: 'unparseable URL' });
      return;
    }
    const origin = `${parsed.protocol}//${parsed.host}`;
    const host = parsed.host;
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;

    // Respect robots.txt before anything else (trust before acquisition).
    const robots = await robotsFor(origin, host);
    if (cfg.respectRobots && !robots.isAllowed(pathAndQuery)) {
      await hooks.emit({ type: 'excluded', url: item.url, canonicalUrl: item.canonical, depth: item.depth, ...(item.from ? { from: item.from } : {}), reason: 'robots.txt' });
      return;
    }

    // Page budget (only real fetches count against it).
    if (fetchesStarted >= cfg.maxPages) {
      await hooks.emit({ type: 'skipped', url: item.url, canonicalUrl: item.canonical, depth: item.depth, ...(item.from ? { from: item.from } : {}), reason: 'page limit reached' });
      return;
    }
    fetchesStarted++;

    await politeWait(host, robots.crawlDelaySec);
    if (shouldStop()) return;

    const started = now();
    try {
      const fetched = await fetchDocument(fetchImpl, item.url, opts.userAgent, cfg.timeoutMs, cfg.maxRetries, sleep);
      const durationMs = now() - started;

      if (fetched.kind === 'error') {
        await hooks.emit({ type: 'error', url: item.url, canonicalUrl: item.canonical, depth: item.depth, ...(item.from ? { from: item.from } : {}), ...(fetched.status ? { httpStatus: fetched.status } : {}), error: fetched.error });
        return;
      }

      const finalUrl = fetched.finalUrl;
      const redirected = canonicalizeUrl(finalUrl) !== item.canonical;
      // A redirect that leaves the crawl scope is honestly recorded, not silently stored.
      if (redirected && cfg.sameSiteOnly && !sameSite(seedForScope, finalUrl)) {
        await hooks.emit({ type: 'skipped', url: item.url, canonicalUrl: item.canonical, depth: item.depth, ...(item.from ? { from: item.from } : {}), reason: `off-site redirect to ${shortLabel(finalUrl)}` });
        return;
      }
      if (!HTML_TYPES.test(fetched.contentType)) {
        await hooks.emit({ type: 'skipped', url: item.url, canonicalUrl: item.canonical, depth: item.depth, ...(item.from ? { from: item.from } : {}), reason: `not HTML (${fetched.contentType || 'unknown'})` });
        return;
      }
      if (fetched.bytes.byteLength > MAX_BYTES) {
        await hooks.emit({ type: 'skipped', url: item.url, canonicalUrl: item.canonical, depth: item.depth, ...(item.from ? { from: item.from } : {}), reason: 'document too large' });
        return;
      }

      const rawHtml = decodeBody(fetched.bytes, fetched.contentType);
      const extracted = extractHtml(rawHtml, finalUrl);
      const contentHash = createHash('sha256').update(fetched.bytes).digest('hex');
      const page: FetchedPage = {
        url: item.url,
        canonicalUrl: canonicalizeUrl(finalUrl),
        depth: item.depth,
        ...(item.from ? { discoveredFrom: item.from } : {}),
        httpStatus: fetched.status,
        contentType: fetched.contentType,
        ...(redirected ? { redirectedTo: finalUrl } : {}),
        bytes: fetched.bytes.byteLength,
        contentHash,
        rawHtml,
        extracted,
        fetchedAt: isoNow(),
        durationMs,
      };
      await hooks.emit({ type: 'fetched', page });
      await enqueueLinks(page);
    } catch (err) {
      await hooks.emit({ type: 'error', url: item.url, canonicalUrl: item.canonical, depth: item.depth, ...(item.from ? { from: item.from } : {}), error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      if (shouldStop()) return;
      const item = queue.shift();
      if (!item) {
        if (active === 0) return;   // drained and nothing in flight → done
        await sleep(10);            // in-flight work may enqueue more; yield and retry
        continue;
      }
      if (fetchesStarted >= cfg.maxPages && queue.length === 0 && active === 0) return;
      active++;
      try {
        await process(item);
      } finally {
        active--;
      }
    }
  }

  const workerCount = Math.max(1, Math.min(cfg.concurrency, 16));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

// --- fetching ---------------------------------------------------------------

type FetchResult =
  | { readonly kind: 'ok'; readonly status: number; readonly contentType: string; readonly bytes: Buffer; readonly finalUrl: string }
  | { readonly kind: 'error'; readonly status?: number; readonly error: string };

/** Fetch a document, following redirects manually (so they are observable) and
 *  retrying transient failures (network errors, 429, 5xx) with linear backoff. */
async function fetchDocument(
  fetchImpl: typeof fetch,
  url: string,
  userAgent: string,
  timeoutMs: number,
  maxRetries: number,
  sleep: (ms: number) => Promise<void>,
): Promise<FetchResult> {
  let attempt = 0;
  for (;;) {
    try {
      let current = url;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const res = await withTimeout(fetchImpl, current, userAgent, timeoutMs, 'manual');
        const status = res.status;
        if (status >= 300 && status < 400) {
          const location = res.headers.get('location');
          if (!location) return { kind: 'error', status, error: `redirect ${status} without Location` };
          const next = tryParseUrl(location, current);
          if (!next) return { kind: 'error', status, error: `invalid redirect target` };
          current = next.toString();
          continue;
        }
        if (status === 429 || status >= 500) {
          // Transient — fall through to retry logic below.
          throw new TransientError(`HTTP ${status}`, status);
        }
        if (status >= 400) {
          return { kind: 'error', status, error: `HTTP ${status}` };
        }
        const contentType = res.headers.get('content-type') ?? '';
        const declared = Number(res.headers.get('content-length') ?? '');
        if (Number.isFinite(declared) && declared > MAX_BYTES) {
          return { kind: 'error', status, error: 'document too large' };
        }
        const bytes = Buffer.from(await res.arrayBuffer());
        return { kind: 'ok', status, contentType, bytes, finalUrl: current };
      }
      return { kind: 'error', error: 'too many redirects' };
    } catch (err) {
      const status = err instanceof TransientError ? err.status : undefined;
      if (attempt >= maxRetries) {
        return { kind: 'error', ...(status ? { status } : {}), error: err instanceof Error ? err.message : String(err) };
      }
      attempt++;
      await sleep(250 * attempt); // linear backoff
    }
  }
}

class TransientError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'TransientError';
    if (status !== undefined) this.status = status;
  }
}

async function withTimeout(
  fetchImpl: typeof fetch,
  url: string,
  userAgent: string,
  timeoutMs: number,
  redirect: 'follow' | 'manual',
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      redirect,
      signal: controller.signal,
      headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Decode raw bytes to a string using the charset from the content-type when present. */
function decodeBody(bytes: Buffer, contentType: string): string {
  const m = /charset=([^;]+)/i.exec(contentType);
  const charset = (m?.[1] ?? 'utf-8').trim().toLowerCase();
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
}
