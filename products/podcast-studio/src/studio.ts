/**
 * PodcastStudioService — the Podcast Studio application service.
 *
 * Orchestrates the KMOS platform into the product experience: submit an episode, watch
 * a visible pipeline, and leave with verifiable, navigable knowledge. It owns NO
 * business logic and NO canonical objects — concepts, assets, evidence, lineage, trust,
 * and relationships all live in KMOS. This layer coordinates KMOS operations and
 * assembles read models (evidence quotes, chapters) as projections. It bypasses nothing.
 *
 * WP1 (core slice): the pipeline runs fully for a supplied transcript; acquisition,
 * audio, subtitles, clips, and summaries degrade honestly until later work packages wire
 * their providers.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { CanonicalId } from '@kmos/canonical-kernel';
import type { PodcastPlatform } from './platform.js';
import { parseTranscript, segmentsToText, totalDuration } from './transcript.js';
import { detectChapters } from './chapters.js';
import { findEvidence } from './evidence.js';
import { resolveSource, type TranscriptFetcher } from './acquisition.js';
import { toSrt, toVtt } from './subtitles.js';
import { chapterClips, highlightReel, type HighlightSpan } from './clips.js';
import { extractiveSummary } from './summary.js';
import { detectMoments } from './moments.js';
import type {
  ConceptView, LineageNode, RelatedConcept, Episode, EpisodeKind, StageId, StageState, TrustView,
} from './types.js';

export interface SubmitInput {
  readonly kind: EpisodeKind;
  /** RSS/audio/YouTube URL, or a filename for uploads. */
  readonly reference: string;
  readonly title?: string;
  readonly show?: string;
  /** Transcript text (required in WP1 unless acquisition/ASR is wired). Timestamped or prose. */
  readonly transcript?: string;
  /** Optional second language to translate concepts + transcript into. */
  readonly targetLanguage?: string;
}

const STAGE_DEFS: { id: StageId; label: string }[] = [
  { id: 'acquire', label: 'Acquire episode' },
  { id: 'audio', label: 'Audio extraction' },
  { id: 'transcribe', label: 'Transcript' },
  { id: 'chapters', label: 'Chapter detection' },
  { id: 'concepts', label: 'Concept extraction' },
  { id: 'evidence', label: 'Evidence grounding' },
  { id: 'relate', label: 'Relationship discovery' },
  { id: 'trust', label: 'Trust assessment' },
  { id: 'index', label: 'Search indexing' },
  { id: 'summary', label: 'Summary' },
  { id: 'moments', label: 'Moment detection' },
  { id: 'subtitles', label: 'Subtitles' },
  { id: 'clips', label: 'Clips & reel' },
  { id: 'package', label: 'Packaging' },
];

export class PodcastStudioService {
  private readonly p: PodcastPlatform;
  private readonly episodes = new Map<string, Episode>();
  private readonly trust = new Map<CanonicalId, TrustView>();
  private readonly conceptEpisode = new Map<CanonicalId, string>();
  private readonly inputs = new Map<string, SubmitInput>();
  private orgId?: CanonicalId;
  private readonly now: () => string;
  /** Provider-independent transcript/ASR fetcher (yt-dlp/Whisper/Speaches behind an
   * HTTP contract, from @kmos/providers). Absent → honest degradation. */
  private readonly transcriptFetcher?: TranscriptFetcher;

  constructor(platform: PodcastPlatform, opts: { now?: () => string; transcriptFetcher?: TranscriptFetcher } = {}) {
    this.p = platform;
    this.now = opts.now ?? (() => new Date().toISOString());
    if (opts.transcriptFetcher) this.transcriptFetcher = opts.transcriptFetcher;
  }

  /** Register an episode and start processing in the background. Returns immediately
   * with the queued Episode so the UI can poll {@link getEpisode} for live progress. */
  async submit(input: SubmitInput): Promise<Episode> {
    const ep = await this.createEpisode(input);
    void this.runPipeline(ep.id, input).catch((err: unknown) => this.failEpisode(ep.id, err));
    return ep;
  }

  /** Submit and await full processing (tests + CLI). */
  async submitAndProcess(input: SubmitInput): Promise<Episode> {
    const ep = await this.createEpisode(input);
    try {
      await this.runPipeline(ep.id, input);
    } catch (err) {
      await this.failEpisode(ep.id, err);
    }
    return this.episodes.get(ep.id)!;
  }

  /** Re-run processing for a failed/interrupted episode, reusing its original input
   * (in-session) or reconstructing the transcript from its persisted segments. */
  async retry(episodeId: string): Promise<Episode | undefined> {
    const ep = this.episodes.get(episodeId);
    if (!ep) return undefined;
    const original = this.inputs.get(episodeId);
    const transcript = original?.transcript ?? (ep.segments.length ? segmentsToText(ep.segments) : '');
    if (!transcript.trim()) {
      ep.status = 'failed';
      ep.error = 'Cannot retry: the original transcript is unavailable. Please submit the episode again.';
      return ep;
    }
    const input: SubmitInput = {
      kind: ep.kind, reference: ep.reference, title: ep.title,
      ...(ep.show ? { show: ep.show } : {}),
      transcript, ...(ep.targetLanguage ? { targetLanguage: ep.targetLanguage } : {}),
    };
    ep.status = 'queued';
    ep.error = '';
    for (const st of ep.stages) { st.status = 'pending'; delete st.detail; delete st.startedAt; delete st.finishedAt; }
    this.inputs.set(episodeId, input);
    void this.runPipeline(episodeId, input).catch((err: unknown) => this.failEpisode(episodeId, err));
    return ep;
  }

  /** Toggle the favorite flag (daily-driver quick access). */
  async toggleFavorite(episodeId: string): Promise<Episode | undefined> {
    const ep = this.episodes.get(episodeId);
    if (!ep) return undefined;
    ep.favorite = !ep.favorite;
    ep.updatedAt = this.now();
    return ep;
  }

  private async createEpisode(input: SubmitInput): Promise<Episode> {
    const id = `ep-${randomUUID().slice(0, 8)}`;
    const at = this.now();
    const ep: Episode = {
      id,
      kind: input.kind,
      title: input.title?.trim() || defaultTitle(input),
      reference: input.reference,
      ...(input.show ? { show: input.show } : {}),
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
    this.episodes.set(id, ep);
    this.inputs.set(id, input);
    return ep;
  }

  /** The organization every piece of knowledge is attributed to (created once). */
  private async ensureOrg(): Promise<CanonicalId> {
    if (!this.orgId) {
      const org = await this.p.identity.createOrganization('Podcast Studio');
      this.orgId = org.id;
    }
    return this.orgId;
  }

  private async runPipeline(episodeId: string, input: SubmitInput): Promise<void> {
    const ep = this.episodes.get(episodeId)!;
    ep.status = 'processing';
    const orgId = await this.ensureOrg();

    // 1) Acquire — obtain a transcript. A supplied transcript is always honest; otherwise
    //    resolve the source and fetch captions/ASR via the configured provider (WP2). With
    //    no provider and no transcript, degrade honestly ("needs infra").
    let transcriptText = (input.transcript ?? '').trim();
    let fetched = false;
    if (!transcriptText && this.transcriptFetcher) {
      const resolved = resolveSource(input.kind, input.reference);
      if (resolved.audioRef) {
        try {
          const captions = await this.transcriptFetcher(resolved.audioRef);
          if (captions && captions.trim()) { transcriptText = captions.trim(); fetched = true; }
        } catch {
          // Degrade gracefully: fall through to the honest "needs infra" path.
        }
      }
    }
    const acquireMode: StageState['mode'] = transcriptText ? 'kmos' : 'external';
    const acquireDetail = fetched
      ? `Transcript fetched via the configured caption/ASR capability for this ${input.kind} episode.`
      : transcriptText
        ? (input.kind === 'transcript' ? 'Transcript supplied directly.' : `Transcript supplied for this ${input.kind} episode.`)
        : `Acquisition + ASR for a ${input.kind} episode run via a yt-dlp/Whisper capability (not configured here). Paste a transcript to process now.`;
    this.startStage(ep, 'acquire', acquireMode, acquireDetail);
    if (!transcriptText) {
      this.doneStage(ep, 'acquire', 'failed');
      throw new Error('No transcript available. Paste a transcript to process this episode (acquisition/ASR not configured).');
    }
    this.doneStage(ep, 'acquire');

    // 2) Audio extraction — not needed when a transcript is supplied (honest).
    this.startStage(ep, 'audio', 'external', 'Skipped: transcript supplied. Audio extraction uses an ffmpeg capability when starting from raw media.');
    this.doneStage(ep, 'audio', 'skipped');

    // 3) Transcript — register episode + transcript Assets in KMOS with real lineage.
    this.startStage(ep, 'transcribe', 'kmos', 'Registering episode + transcript assets with lineage.');
    const sourceAsset = await this.p.assets.registerAsset({
      assetType: 'Media', mediaType: input.kind === 'youtube' ? 'video/youtube' : 'audio/mpeg',
      displayName: ep.title, organizationId: orgId,
      storageRef: { storageId: `${episodeId}/source`, backend: 'object' },
      checksum: sha256(input.reference), provenance: { origin: 'Ingested', originalSource: input.reference },
    });
    const transcriptAsset = await this.p.assets.registerAsset({
      assetType: 'Document', mediaType: 'text/plain', displayName: `${ep.title} — transcript`,
      organizationId: orgId, storageRef: { storageId: `${episodeId}/transcript`, backend: 'object' },
      checksum: sha256(transcriptText), content: new TextEncoder().encode(transcriptText),
      provenance: { origin: 'Ingested', originalSource: input.reference },
    });
    await this.p.assets.recordDerivation({ derivedAssetId: transcriptAsset.id, inputAssetIds: [sourceAsset.id] });
    ep.sourceAssetId = sourceAsset.id;
    ep.transcriptAssetId = transcriptAsset.id;
    ep.segments = parseTranscript(transcriptText);
    ep.durationSec = totalDuration(ep.segments);
    this.doneStage(ep, 'transcribe', 'done', `${ep.segments.length} segments, ${Math.round(ep.durationSec / 60)} min.`);

    // 4) Chapters — projection over segments.
    this.startStage(ep, 'chapters', 'projection', 'Detecting chapters from pauses + structure.');
    ep.chapters = detectChapters(ep.segments);
    this.doneStage(ep, 'chapters', 'done', `${ep.chapters.length} chapters.`);

    // 5) Concepts (+ optional translation) — KMOS Language domain.
    this.startStage(ep, 'concepts', 'reference', 'Extracting concepts via the Language domain (reference capability offline; Ollama/hosted LLM in production).');
    const processed = await this.p.language.processTranscript({
      transcript: segmentsToText(ep.segments),
      organizationId: orgId,
      ...(input.targetLanguage ? { targetLanguage: input.targetLanguage } : {}),
    });
    ep.conceptIds = [...processed.conceptIds];
    ep.correctedTranscript = processed.correctedTranscript;
    if (processed.translatedTranscript !== undefined) ep.translatedTranscript = processed.translatedTranscript;
    for (const cid of ep.conceptIds) this.conceptEpisode.set(cid, episodeId);
    this.doneStage(ep, 'concepts', 'done', `${ep.conceptIds.length} concepts.`);

    // 6) Evidence — verify each concept is locatable in the transcript (projection).
    this.startStage(ep, 'evidence', 'projection', 'Grounding concepts to exact transcript passages.');
    let grounded = 0;
    for (const cid of ep.conceptIds) {
      const ko = this.p.knowledge.getKnowledge(cid);
      if (ko && findEvidence(ep.segments, ko.body.canonicalName, { maxQuotes: 1 }).length > 0) grounded++;
    }
    this.doneStage(ep, 'evidence', 'done', `${grounded}/${ep.conceptIds.length} concepts grounded in a passage.`);

    // 7) Relationships — record structural co-occurrence in KMOS (heuristic).
    this.startStage(ep, 'relate', 'kmos', 'Recording concept relationships from co-occurrence.');
    const relCount = await this.relateConcepts(ep, transcriptAsset.id);
    this.doneStage(ep, 'relate', 'done', `${relCount} relationships.`);

    // 8) Trust — explainable assessment per concept via Governance.
    this.startStage(ep, 'trust', 'kmos', 'Assessing explainable trust per concept.');
    for (const cid of ep.conceptIds) {
      const ko = this.p.knowledge.getKnowledge(cid);
      const hasEvidence = !!ko && findEvidence(ep.segments, ko.body.canonicalName, { maxQuotes: 1 }).length > 0;
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
    this.doneStage(ep, 'trust');

    // 9) Search indexing — rebuild the projection so concepts are discoverable.
    this.startStage(ep, 'index', 'kmos', 'Indexing concepts for semantic search.');
    await this.p.search.rebuild();
    this.doneStage(ep, 'index');

    // Concept names (for summary / moments / highlight reel).
    const conceptNames: string[] = [];
    for (const cid of ep.conceptIds) {
      const ko = this.p.knowledge.getKnowledge(cid);
      if (ko) conceptNames.push(ko.body.canonicalName);
    }

    // 9a) Summary — extractive reference (LLM provider on the estate).
    this.startStage(ep, 'summary', 'reference', 'Summarizing the episode (extractive reference; LLM in production).');
    ep.summary = extractiveSummary(ep.segments, conceptNames);
    this.doneStage(ep, 'summary', 'done', ep.summary ? `${ep.summary.split(/\s+/).length} words.` : 'No summary.');

    // 9a2) Moments — notable timestamps to jump to / clip.
    this.startStage(ep, 'moments', 'reference', 'Detecting notable moments (reference; LLM in production).');
    ep.moments = detectMoments(ep.segments, conceptNames);
    this.doneStage(ep, 'moments', 'done', `${ep.moments.length} moments.`);

    // 9b) Subtitles — real SRT/VTT tracks (offline capability), registered with lineage.
    this.startStage(ep, 'subtitles', 'projection', 'Generating SRT + VTT subtitle tracks.');
    ep.subtitleSrt = toSrt(ep.segments);
    ep.subtitleVtt = toVtt(ep.segments);
    const subtitleAsset = await this.p.assets.registerAsset({
      assetType: 'Document', mediaType: 'application/x-subrip', displayName: `${ep.title} — subtitles`,
      organizationId: orgId, storageRef: { storageId: `${episodeId}/subtitles.srt`, backend: 'object' },
      checksum: sha256(ep.subtitleSrt), content: new TextEncoder().encode(ep.subtitleSrt),
      provenance: { origin: 'Ingested', originalSource: input.reference },
    });
    await this.p.assets.recordDerivation({ derivedAssetId: subtitleAsset.id, inputAssetIds: [transcriptAsset.id] });
    ep.subtitleAssetId = subtitleAsset.id;
    this.doneStage(ep, 'subtitles', 'done', `${ep.segments.length} cues.`);

    // 9c) Clips + highlight reel — a deterministic cut plan (render via ffmpeg on the estate).
    this.startStage(ep, 'clips', 'external', 'Planning chapter clips + a highlight reel (render via an ffmpeg capability).');
    const spans: HighlightSpan[] = (ep.moments ?? []).map((m) => ({ startSec: m.startSec, endSec: m.endSec, label: m.label }));
    ep.clips = [...chapterClips(ep.chapters), ...highlightReel(spans, ep.segments, { maxClips: 5 })];
    this.doneStage(ep, 'clips', 'done', `${ep.clips.length} clips planned (${ep.chapters.length} chapter + highlight reel).`);

    // 10) Package — done.
    this.startStage(ep, 'package', 'kmos', 'Assembling knowledge products.');
    this.doneStage(ep, 'package');
    ep.status = 'ready';
    ep.updatedAt = this.now();
  }

  /** Connect concepts that co-occur within a segment, bounded, recorded in KMOS. */
  private async relateConcepts(ep: Episode, evidenceAssetId: CanonicalId): Promise<number> {
    const names = new Map<CanonicalId, string>();
    for (const cid of ep.conceptIds.slice(0, 60)) {
      const ko = this.p.knowledge.getKnowledge(cid);
      if (ko) names.set(cid, ko.body.canonicalName.toLowerCase());
    }
    const pairCounts = new Map<string, { a: CanonicalId; b: CanonicalId; n: number }>();
    for (const seg of ep.segments) {
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

  private startStage(ep: Episode, id: StageId, mode: StageState['mode'], detail?: string): void {
    const st = ep.stages.find((s) => s.id === id)!;
    st.status = 'running'; st.mode = mode; st.startedAt = this.now();
    if (detail) st.detail = detail;
    ep.updatedAt = this.now();
  }

  private doneStage(ep: Episode, id: StageId, status: StageState['status'] = 'done', detail?: string): void {
    const st = ep.stages.find((s) => s.id === id)!;
    st.status = status; st.finishedAt = this.now();
    if (detail) st.detail = detail;
    ep.updatedAt = this.now();
  }

  private async failEpisode(episodeId: string, err: unknown): Promise<void> {
    const ep = this.episodes.get(episodeId);
    if (!ep) return;
    ep.status = 'failed';
    ep.error = err instanceof Error ? err.message : String(err);
    const running = ep.stages.find((s) => s.status === 'running');
    if (running) { running.status = 'failed'; running.finishedAt = this.now(); }
    ep.updatedAt = this.now();
  }

  // --- Read models --------------------------------------------------------

  getEpisode(id: string): Episode | undefined {
    return this.episodes.get(id);
  }

  listEpisodes(): readonly Episode[] {
    return [...this.episodes.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** The full, verifiable concept view — the heart of the product. */
  conceptView(id: CanonicalId): ConceptView | undefined {
    const ko = this.p.knowledge.getKnowledge(id);
    if (!ko) return undefined;
    const episodeId = this.conceptEpisode.get(id);
    const ep = episodeId ? this.episodes.get(episodeId) : undefined;
    const name = ko.body.canonicalName;

    const evidence = ep ? findEvidence(ep.segments, name, { maxQuotes: 3 }) : [];
    const related = this.relatedConcepts(id);
    const lineage = this.lineageFor(ep);
    const trust = this.trust.get(id) ?? { trusted: false, score: 0, reasons: ['Not yet assessed.'] };
    const vocabulary = this.p.knowledge.getVocabulary(id).map((v) => ({ language: v.body.language, term: v.body.preferredTerm }));

    return {
      id, name, definition: ko.body.definition ?? '',
      episodeId: episodeId ?? '', episodeTitle: ep?.title ?? 'Unknown episode',
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

  private lineageFor(ep: Episode | undefined): LineageNode[] {
    if (!ep?.transcriptAssetId) return [];
    const graph = this.p.assets.getLineage(ep.transcriptAssetId);
    const ids = [graph.assetId, ...graph.ancestors];
    const nodes: LineageNode[] = [];
    for (const assetId of ids) {
      const asset = this.p.assets.getAsset(assetId);
      if (asset) nodes.push({ assetId, label: asset.displayName ?? asset.body.assetType, kind: asset.body.assetType });
    }
    return nodes;
  }

  /** Semantic search over concepts, each hit enriched with a supporting quote. */
  search(query: string): Array<{ id: CanonicalId; name: string; score: number; quote?: string; startSec?: number; episodeId: string }> {
    const hits = this.p.search.search(query, { limit: 25 });
    const out: Array<{ id: CanonicalId; name: string; score: number; quote?: string; startSec?: number; episodeId: string }> = [];
    for (const hit of hits) {
      const ko = this.p.knowledge.getKnowledge(hit.subjectId);
      if (!ko) continue;
      const episodeId = this.conceptEpisode.get(hit.subjectId);
      const ep = episodeId ? this.episodes.get(episodeId) : undefined;
      const evq = ep ? findEvidence(ep.segments, ko.body.canonicalName, { maxQuotes: 1 })[0] : undefined;
      out.push({
        id: hit.subjectId, name: ko.body.canonicalName, score: hit.score,
        episodeId: episodeId ?? '',
        ...(evq ? { quote: evq.quote, startSec: evq.startSec } : {}),
      });
    }
    return out;
  }

  /** Light concept summaries for an episode outline (name, evidence count, trust). */
  conceptSummaries(episodeId: string): Array<{ id: CanonicalId; name: string; definition: string; evidenceCount: number; trusted: boolean; startSec?: number }> {
    const ep = this.episodes.get(episodeId);
    if (!ep) return [];
    const out: Array<{ id: CanonicalId; name: string; definition: string; evidenceCount: number; trusted: boolean; startSec?: number }> = [];
    for (const cid of ep.conceptIds) {
      const ko = this.p.knowledge.getKnowledge(cid);
      if (!ko) continue;
      const evq = findEvidence(ep.segments, ko.body.canonicalName, { maxQuotes: 3 });
      out.push({
        id: cid, name: ko.body.canonicalName, definition: ko.body.definition ?? '',
        evidenceCount: evq.length, trusted: this.trust.get(cid)?.trusted ?? false,
        ...(evq[0] ? { startSec: evq[0].startSec } : {}),
      });
    }
    return out.sort((a, b) => b.evidenceCount - a.evidenceCount || a.name.localeCompare(b.name));
  }
}

function defaultTitle(input: SubmitInput): string {
  if (input.kind === 'upload') return input.reference.replace(/\.[a-z0-9]+$/i, '');
  if (input.kind === 'transcript') return 'Pasted transcript';
  return input.reference;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
