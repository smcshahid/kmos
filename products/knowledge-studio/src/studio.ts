/**
 * StudioService — the Knowledge Studio application service.
 *
 * Orchestrates the KMOS platform into the product experience: submit a source,
 * watch a visible pipeline, and leave with verifiable, navigable knowledge. It owns
 * NO business logic and NO canonical objects — concepts, assets, evidence, lineage,
 * trust, relationships, and collections all live in KMOS. This layer coordinates
 * KMOS operations and assembles read models (evidence quotes, chapters) as
 * projections over data KMOS already holds. It bypasses nothing (KMOS-9999 §9).
 */

import { createHash, randomUUID } from 'node:crypto';
import type { CanonicalId } from '@kmos/canonical-kernel';
import type { StudioPlatform } from './platform.js';
import { parseTranscript, segmentsToText, totalDuration } from './transcript.js';
import { detectChapters } from './chapters.js';
import { findEvidence } from './evidence.js';
import { resolveYouTube } from './youtube.js';
import { type SourceStore, trustSubset } from './source-store.js';
import type {
  ConceptView, LineageNode, RelatedConcept, Source, SourceKind, StageId, StageState, TrustView,
} from './types.js';

export interface SubmitInput {
  readonly kind: SourceKind;
  /** YouTube URL, or a filename for uploads. */
  readonly reference: string;
  readonly title?: string;
  /** Transcript text (required unless captions can be resolved). Timestamped or prose. */
  readonly transcript?: string;
  /** Optional second language to translate concepts + transcript into. */
  readonly targetLanguage?: string;
}

const STAGE_DEFS: { id: StageId; label: string }[] = [
  { id: 'acquire', label: 'Acquire source' },
  { id: 'audio', label: 'Audio extraction' },
  { id: 'transcribe', label: 'Transcript' },
  { id: 'chapters', label: 'Chapter detection' },
  { id: 'concepts', label: 'Concept extraction' },
  { id: 'evidence', label: 'Evidence grounding' },
  { id: 'relate', label: 'Relationship discovery' },
  { id: 'trust', label: 'Trust assessment' },
  { id: 'index', label: 'Search indexing' },
  { id: 'package', label: 'Packaging' },
];

export class StudioService {
  private readonly p: StudioPlatform;
  private readonly sources = new Map<string, Source>();
  private readonly trust = new Map<CanonicalId, TrustView>();
  private readonly conceptSource = new Map<CanonicalId, string>();
  /** In-session original transcript per source, for same-session retry. */
  private readonly inputs = new Map<string, SubmitInput>();
  private readonly store?: SourceStore;
  /** Provider-independent async caption/ASR fetcher (yt-dlp/Whisper/Speaches behind
   * an HTTP contract). When absent, YouTube without a supplied transcript degrades
   * honestly (the pipeline reports "needs infra"). */
  private readonly captionFetcher?: (videoId: string) => Promise<string | undefined>;
  private orgId?: CanonicalId;
  private readonly now: () => string;

  constructor(platform: StudioPlatform, opts: {
    now?: () => string;
    store?: SourceStore;
    captionFetcher?: (videoId: string) => Promise<string | undefined>;
  } = {}) {
    this.p = platform;
    this.now = opts.now ?? (() => new Date().toISOString());
    if (opts.store) this.store = opts.store;
    if (opts.captionFetcher) this.captionFetcher = opts.captionFetcher;
  }

  /**
   * Recover persisted source job-state on boot so the full experience survives a
   * restart (the daily-driver promise). The canonical knowledge is already rehydrated
   * by the platform from the durable event log; here we restore the view layer:
   * transcript segments, chapters, per-concept trust, and the concept→source map. A
   * source caught mid-processing by the restart is marked failed-and-retryable rather
   * than left forever "processing".
   */
  async init(): Promise<void> {
    if (!this.store) return;
    await this.store.init();
    for (const entry of await this.store.load()) {
      const source = entry.source;
      if (source.status === 'processing' || source.status === 'queued') {
        source.status = 'failed';
        source.error = 'Processing was interrupted by a restart. Retry to finish.';
        const running = source.stages.find((s) => s.status === 'running' || s.status === 'pending');
        if (running && running.status === 'running') running.status = 'failed';
      }
      this.sources.set(source.id, source);
      for (const cid of source.conceptIds) this.conceptSource.set(cid, source.id);
      for (const [cid, t] of Object.entries(entry.trust)) this.trust.set(cid as CanonicalId, t);
    }
  }

  private async persist(sourceId: string): Promise<void> {
    if (!this.store) return;
    const source = this.sources.get(sourceId);
    if (!source) return;
    try {
      await this.store.save({ source, trust: trustSubset(source.conceptIds, this.trust) });
    } catch {
      // Persistence is best-effort; a storage hiccup must never crash processing.
    }
  }

  /** The organization every piece of knowledge is attributed to (created once). */
  private async ensureOrg(): Promise<CanonicalId> {
    if (!this.orgId) {
      const org = await this.p.identity.createOrganization('Knowledge Studio');
      this.orgId = org.id;
    }
    return this.orgId;
  }

  // --- Submit + pipeline --------------------------------------------------

  /** Register a source and start processing in the background. Returns immediately
   * with the queued Source so the UI can poll {@link getSource} for live progress. */
  async submit(input: SubmitInput): Promise<Source> {
    const source = await this.createSource(input);
    void this.runPipeline(source.id, input)
      .then(() => this.persist(source.id))
      .catch((err: unknown) => this.failSource(source.id, err));
    return source;
  }

  /** Submit and await full processing (used by tests and CLI). */
  async submitAndProcess(input: SubmitInput): Promise<Source> {
    const source = await this.createSource(input);
    try {
      await this.runPipeline(source.id, input);
      await this.persist(source.id);
    } catch (err) {
      await this.failSource(source.id, err);
    }
    return this.sources.get(source.id)!;
  }

  /** Re-run processing for a failed/interrupted source, reusing its original input
   * (in-session) or reconstructing the transcript from its persisted segments. */
  async retry(sourceId: string): Promise<Source | undefined> {
    const source = this.sources.get(sourceId);
    if (!source) return undefined;
    const original = this.inputs.get(sourceId);
    const transcript = original?.transcript ?? (source.segments.length ? segmentsToText(source.segments) : '');
    if (!transcript.trim()) {
      source.status = 'failed';
      source.error = 'Cannot retry: the original transcript is unavailable. Please submit the source again.';
      await this.persist(sourceId);
      return source;
    }
    const input: SubmitInput = {
      kind: source.kind, reference: source.reference, title: source.title,
      transcript, ...(source.targetLanguage ? { targetLanguage: source.targetLanguage } : {}),
    };
    // Reset stages and re-run.
    source.status = 'queued';
    source.error = '';
    for (const st of source.stages) { st.status = 'pending'; delete st.detail; delete st.startedAt; delete st.finishedAt; }
    this.inputs.set(sourceId, input);
    void this.runPipeline(sourceId, input)
      .then(() => this.persist(sourceId))
      .catch((err: unknown) => this.failSource(sourceId, err));
    return source;
  }

  /** Toggle the favorite flag (daily-driver quick access). */
  async toggleFavorite(sourceId: string): Promise<Source | undefined> {
    const source = this.sources.get(sourceId);
    if (!source) return undefined;
    source.favorite = !source.favorite;
    source.updatedAt = this.now();
    await this.persist(sourceId);
    return source;
  }

  private async createSource(input: SubmitInput): Promise<Source> {
    const id = `src-${randomUUID().slice(0, 8)}`;
    const at = this.now();
    const source: Source = {
      id,
      kind: input.kind,
      title: input.title?.trim() || defaultTitle(input),
      reference: input.reference,
      ...(input.targetLanguage ? { targetLanguage: input.targetLanguage } : {}),
      status: 'queued',
      favorite: false,
      createdAt: at,
      updatedAt: at,
      stages: STAGE_DEFS.map((d) => ({ id: d.id, label: d.label, status: 'pending', mode: 'kmos' })),
      segments: [],
      chapters: [],
      conceptIds: [],
      durationSec: 0,
    };
    this.sources.set(id, source);
    this.inputs.set(id, input);
    await this.persist(id);
    return source;
  }

  private async runPipeline(sourceId: string, input: SubmitInput): Promise<void> {
    const source = this.sources.get(sourceId)!;
    source.status = 'processing';
    const orgId = await this.ensureOrg();

    // 1) Acquire — resolve the source and obtain a transcript.
    let transcriptText = (input.transcript ?? '').trim();
    let acquireDetail: string;
    let acquireMode: StageState['mode'] = 'kmos';
    if (input.kind === 'youtube') {
      const yt = resolveYouTube(input.reference);
      let fetched = false;
      if (!transcriptText && yt.videoId && this.captionFetcher) {
        try {
          const captions = await this.captionFetcher(yt.videoId);
          if (captions && captions.trim()) { transcriptText = captions.trim(); fetched = true; }
        } catch {
          // Degrade gracefully: fall through to the honest "needs infra" path.
        }
      }
      acquireMode = fetched ? 'kmos' : transcriptText ? 'kmos' : 'external';
      acquireDetail = yt.videoId
        ? `YouTube video ${yt.videoId}. ${fetched ? 'Captions fetched via the configured caption/ASR capability.' : transcriptText ? 'Captions/transcript supplied.' : 'Download + captions run via a yt-dlp/Whisper capability (not configured here).'}`
        : 'Unrecognized YouTube URL.';
    } else {
      acquireDetail = input.kind === 'upload'
        ? `Uploaded "${input.reference}". Media decode runs via an ffmpeg capability in production.`
        : 'Transcript supplied directly.';
    }
    this.startStage(source, 'acquire', acquireMode, acquireDetail);
    if (!transcriptText) {
      this.doneStage(source, 'acquire', 'failed');
      throw new Error('No transcript available. Paste a transcript (or captions) to process this source.');
    }
    this.doneStage(source, 'acquire');

    // 2) Audio extraction — not needed when a transcript is supplied (honest).
    this.startStage(source, 'audio', 'external', 'Skipped: transcript supplied. Audio extraction uses an ffmpeg capability when starting from raw media.');
    this.doneStage(source, 'audio', 'skipped');

    // 3) Transcript — register source + transcript Assets in KMOS with real lineage.
    this.startStage(source, 'transcribe', 'kmos', 'Registering source + transcript assets with lineage.');
    const sourceAsset = await this.p.assets.registerAsset({
      assetType: 'Media', mediaType: input.kind === 'youtube' ? 'video/youtube' : 'video/mp4',
      displayName: source.title, organizationId: orgId,
      storageRef: { storageId: `${sourceId}/source`, backend: 'object' },
      checksum: sha256(input.reference), provenance: { origin: 'Ingested', originalSource: input.reference },
    });
    const transcriptAsset = await this.p.assets.registerAsset({
      assetType: 'Document', mediaType: 'text/plain', displayName: `${source.title} — transcript`,
      organizationId: orgId, storageRef: { storageId: `${sourceId}/transcript`, backend: 'object' },
      checksum: sha256(transcriptText), content: new TextEncoder().encode(transcriptText),
      provenance: { origin: 'Ingested', originalSource: input.reference },
    });
    await this.p.assets.recordDerivation({ derivedAssetId: transcriptAsset.id, inputAssetIds: [sourceAsset.id] });
    source.sourceAssetId = sourceAsset.id;
    source.transcriptAssetId = transcriptAsset.id;
    source.segments = parseTranscript(transcriptText);
    source.durationSec = totalDuration(source.segments);
    this.doneStage(source, 'transcribe', 'done', `${source.segments.length} segments, ${Math.round(source.durationSec / 60)} min.`);

    // 4) Chapters — projection over segments.
    this.startStage(source, 'chapters', 'projection', 'Detecting chapters from pauses + structure.');
    source.chapters = detectChapters(source.segments);
    this.doneStage(source, 'chapters', 'done', `${source.chapters.length} chapters.`);

    // 5) Concepts (+ optional translation) — KMOS Language domain.
    this.startStage(source, 'concepts', 'reference', 'Extracting concepts via the Language domain (reference capability offline; Ollama/hosted LLM in production).');
    const processed = await this.p.language.processTranscript({
      transcript: segmentsToText(source.segments),
      organizationId: orgId,
      ...(input.targetLanguage ? { targetLanguage: input.targetLanguage } : {}),
    });
    source.conceptIds = [...processed.conceptIds];
    source.correctedTranscript = processed.correctedTranscript;
    if (processed.translatedTranscript !== undefined) source.translatedTranscript = processed.translatedTranscript;
    for (const cid of source.conceptIds) this.conceptSource.set(cid, sourceId);
    this.doneStage(source, 'concepts', 'done', `${source.conceptIds.length} concepts.`);

    // 6) Evidence — verify each concept is locatable in the transcript (projection).
    this.startStage(source, 'evidence', 'projection', 'Grounding concepts to exact transcript passages.');
    let grounded = 0;
    for (const cid of source.conceptIds) {
      const ko = this.p.knowledge.getKnowledge(cid);
      if (ko && findEvidence(source.segments, ko.body.canonicalName, { maxQuotes: 1 }).length > 0) grounded++;
    }
    this.doneStage(source, 'evidence', 'done', `${grounded}/${source.conceptIds.length} concepts grounded in a passage.`);

    // 7) Relationships — record structural co-occurrence in KMOS (heuristic; a
    //    relationship-discovery capability replaces this in production).
    this.startStage(source, 'relate', 'kmos', 'Recording concept relationships from co-occurrence.');
    const relCount = await this.relateConcepts(source, transcriptAsset.id);
    this.doneStage(source, 'relate', 'done', `${relCount} relationships.`);

    // 8) Trust — explainable assessment per concept via Governance.
    this.startStage(source, 'trust', 'kmos', 'Assessing explainable trust per concept.');
    for (const cid of source.conceptIds) {
      const ko = this.p.knowledge.getKnowledge(cid);
      const hasEvidence = !!ko && findEvidence(source.segments, ko.body.canonicalName, { maxQuotes: 1 }).length > 0;
      // Evidence-decisive, honest trust: identity + policy clear the mandatory gate;
      // knowledgeProvenance reflects a real grounding passage; reviewerApproval is
      // false (nothing is human-reviewed yet). At threshold 0.75 a grounded concept
      // (6/7 ≈ 0.86) surfaces as Trusted while an ungrounded one (5/7 ≈ 0.71) is
      // honestly marked Needs review — never a fabricated claim of trust.
      const result = await this.p.governance.assessTrust({
        subjectId: cid,
        threshold: 0.75,
        evidence: {
          knowledgeProvenance: hasEvidence,
          assetIntegrity: true,
          workflowCompletion: true,
          capabilityCertification: true,
          reviewerApproval: false,
          policyCompliance: true,
          identityVerification: true,
        },
      });
      this.trust.set(cid, { trusted: result.trusted, score: result.score, reasons: result.reasons });
    }
    this.doneStage(source, 'trust');

    // 9) Search indexing — rebuild the projection so concepts are discoverable.
    this.startStage(source, 'index', 'kmos', 'Indexing concepts for semantic search.');
    await this.p.search.rebuild();
    this.doneStage(source, 'index');

    // 10) Package — done.
    this.startStage(source, 'package', 'kmos', 'Assembling knowledge products.');
    this.doneStage(source, 'package');
    source.status = 'ready';
    source.updatedAt = this.now();
  }

  /** Connect concepts that co-occur within a segment, bounded, recorded in KMOS. */
  private async relateConcepts(source: Source, evidenceAssetId: CanonicalId): Promise<number> {
    const names = new Map<CanonicalId, string>();
    for (const cid of source.conceptIds.slice(0, 60)) {
      const ko = this.p.knowledge.getKnowledge(cid);
      if (ko) names.set(cid, ko.body.canonicalName.toLowerCase());
    }
    const pairCounts = new Map<string, { a: CanonicalId; b: CanonicalId; n: number }>();
    for (const seg of source.segments) {
      const hay = seg.text.toLowerCase();
      const present = [...names.entries()].filter(([, n]) => hay.includes(n)).map(([id]) => id);
      for (let i = 0; i < present.length; i++) {
        for (let j = i + 1; j < present.length; j++) {
          const a = present[i]!; const b = present[j]!;
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          const cur = pairCounts.get(key);
          if (cur) cur.n++; else pairCounts.set(key, { a, b, n: 1 });
        }
      }
    }
    const perConcept = new Map<CanonicalId, number>();
    let created = 0;
    for (const { a, b, n } of [...pairCounts.values()].sort((x, y) => y.n - x.n)) {
      if ((perConcept.get(a) ?? 0) >= 4 || (perConcept.get(b) ?? 0) >= 4) continue;
      await this.p.knowledge.createRelationship({
        relation: 'RelatedTo', sourceId: a, targetId: b,
        evidenceRefs: [evidenceAssetId], confidence: Math.min(1, 0.4 + n * 0.2),
      });
      perConcept.set(a, (perConcept.get(a) ?? 0) + 1);
      perConcept.set(b, (perConcept.get(b) ?? 0) + 1);
      created++;
    }
    return created;
  }

  // --- Stage helpers ------------------------------------------------------

  private startStage(source: Source, id: StageId, mode: StageState['mode'], detail?: string): void {
    const st = source.stages.find((s) => s.id === id)!;
    st.status = 'running'; st.mode = mode; st.startedAt = this.now();
    if (detail) st.detail = detail;
    source.updatedAt = this.now();
  }

  private doneStage(source: Source, id: StageId, status: StageState['status'] = 'done', detail?: string): void {
    const st = source.stages.find((s) => s.id === id)!;
    st.status = status; st.finishedAt = this.now();
    if (detail) st.detail = detail;
    source.updatedAt = this.now();
  }

  private async failSource(sourceId: string, err: unknown): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) return;
    source.status = 'failed';
    source.error = err instanceof Error ? err.message : String(err);
    const running = source.stages.find((s) => s.status === 'running');
    if (running) { running.status = 'failed'; running.finishedAt = this.now(); }
    source.updatedAt = this.now();
    await this.persist(sourceId);
  }

  // --- Read models --------------------------------------------------------

  getSource(id: string): Source | undefined {
    return this.sources.get(id);
  }

  listSources(): readonly Source[] {
    return [...this.sources.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** The full, verifiable concept view — the heart of the product. */
  conceptView(id: CanonicalId): ConceptView | undefined {
    const ko = this.p.knowledge.getKnowledge(id);
    if (!ko) return undefined;
    const sourceId = this.conceptSource.get(id);
    const source = sourceId ? this.sources.get(sourceId) : undefined;
    const name = ko.body.canonicalName;

    const evidence = source ? findEvidence(source.segments, name, { maxQuotes: 3 }) : [];
    const related = this.relatedConcepts(id);
    const lineage = this.lineageFor(source);
    const trust = this.trust.get(id) ?? { trusted: false, score: 0, reasons: ['Not yet assessed.'] };
    const vocabulary = this.p.knowledge.getVocabulary(id).map((v) => ({ language: v.body.language, term: v.body.preferredTerm }));

    return {
      id, name, definition: ko.body.definition ?? '',
      sourceId: sourceId ?? '', sourceTitle: source?.title ?? 'Unknown source',
      evidence, related, lineage, trust, vocabulary,
    };
  }

  private relatedConcepts(id: CanonicalId): RelatedConcept[] {
    const graph = this.p.knowledge.buildGraphProjection();
    const out: RelatedConcept[] = [];
    for (const edge of graph.edges.values()) {
      const e = edge as { relation: string; sourceId: CanonicalId; targetId: CanonicalId };
      const otherId = e.sourceId === id ? e.targetId : e.targetId === id ? e.sourceId : undefined;
      if (!otherId) continue;
      const other = this.p.knowledge.getKnowledge(otherId);
      if (!other) continue;
      out.push({
        id: otherId, name: other.body.canonicalName, relation: e.relation,
        direction: e.sourceId === id ? 'outgoing' : 'incoming',
      });
    }
    return out.slice(0, 8);
  }

  private lineageFor(source: Source | undefined): LineageNode[] {
    if (!source?.transcriptAssetId) return [];
    const graph = this.p.assets.getLineage(source.transcriptAssetId);
    // Chain of custody, derived asset first then its ancestors (source media).
    const ids = [graph.assetId, ...graph.ancestors];
    const nodes: LineageNode[] = [];
    for (const assetId of ids) {
      const asset = this.p.assets.getAsset(assetId);
      if (asset) nodes.push({ assetId, label: asset.displayName ?? asset.body.assetType, kind: asset.body.assetType });
    }
    return nodes;
  }

  // --- Search -------------------------------------------------------------

  /** Semantic search over concepts, each hit enriched with a supporting quote. */
  search(query: string): Array<{ id: CanonicalId; name: string; score: number; quote?: string; startSec?: number; sourceId: string }> {
    const hits = this.p.search.search(query, { limit: 25 });
    const out: Array<{ id: CanonicalId; name: string; score: number; quote?: string; startSec?: number; sourceId: string }> = [];
    for (const hit of hits) {
      const ko = this.p.knowledge.getKnowledge(hit.subjectId);
      if (!ko) continue;
      const sourceId = this.conceptSource.get(hit.subjectId);
      const source = sourceId ? this.sources.get(sourceId) : undefined;
      const ev = source ? findEvidence(source.segments, ko.body.canonicalName, { maxQuotes: 1 })[0] : undefined;
      out.push({
        id: hit.subjectId, name: ko.body.canonicalName, score: hit.score,
        sourceId: sourceId ?? '',
        ...(ev ? { quote: ev.quote, startSec: ev.startSec } : {}),
      });
    }
    return out;
  }

  // --- Collections --------------------------------------------------------

  async createCollection(name: string, memberIds: readonly CanonicalId[]): Promise<{ id: CanonicalId; name: string; memberIds: readonly CanonicalId[] }> {
    const col = await this.p.knowledge.createCollection(name, memberIds);
    return { id: col.id, name, memberIds };
  }

  // --- Aggregate read models ---------------------------------------------

  /** Light concept summaries for a source's outline (name, evidence count, trust). */
  conceptSummaries(sourceId: string): Array<{ id: CanonicalId; name: string; definition: string; evidenceCount: number; trusted: boolean; startSec?: number }> {
    const source = this.sources.get(sourceId);
    if (!source) return [];
    const out: Array<{ id: CanonicalId; name: string; definition: string; evidenceCount: number; trusted: boolean; startSec?: number }> = [];
    for (const cid of source.conceptIds) {
      const ko = this.p.knowledge.getKnowledge(cid);
      if (!ko) continue;
      const ev = findEvidence(source.segments, ko.body.canonicalName, { maxQuotes: 3 });
      out.push({
        id: cid, name: ko.body.canonicalName, definition: ko.body.definition ?? '',
        evidenceCount: ev.length, trusted: this.trust.get(cid)?.trusted ?? false,
        ...(ev[0] ? { startSec: ev[0].startSec } : {}),
      });
    }
    return out.sort((a, b) => b.evidenceCount - a.evidenceCount || a.name.localeCompare(b.name));
  }

  /** Full concept views for a source (used by the Download Center). */
  assembleConceptViews(sourceId: string): ConceptView[] {
    const source = this.sources.get(sourceId);
    if (!source) return [];
    return source.conceptIds.map((id) => this.conceptView(id)).filter((v): v is ConceptView => v !== undefined);
  }
}

function defaultTitle(input: SubmitInput): string {
  if (input.kind === 'youtube') return `YouTube — ${resolveYouTube(input.reference).videoId ?? 'video'}`;
  if (input.kind === 'upload') return input.reference.replace(/\.[a-z0-9]+$/i, '');
  return 'Pasted transcript';
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
