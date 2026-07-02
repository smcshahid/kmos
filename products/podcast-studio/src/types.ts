/**
 * Podcast Studio — product-facing types.
 *
 * These describe the PRODUCT's read models and job state — the understanding a
 * listener leaves with. The canonical business objects (Concept, Asset, Evidence,
 * Trust, Collection) live in KMOS; the types here are thin projections/orchestration
 * state the application owns. No business logic lives in this layer (KMOS-9999 §9).
 *
 * KCSI-02 note: `TranscriptSegment`, `Chapter`, and `EvidenceQuote` are intentionally
 * identical to Knowledge Studio's — that duplication is the second-consumer evidence
 * that these projections should become shared capabilities (extracted in WP7).
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { TranscriptSegment, Chapter, EvidenceQuote } from '@kmos/content-projections';

// Shared content-projection types (KCSI-02): transcript segments, chapters, and evidence
// quotes now live in @kmos/content-projections — extracted once Podcast Studio proved the
// second-consumer need. Re-exported so the rest of this app's types read naturally.
export type { TranscriptSegment, Chapter, EvidenceQuote };

/** The processing pipeline stages, in order. Media stages require external infra and
 * are honestly reported as such (see StageMode). Podcast-specific stages
 * (subtitles/clips/summary) are added by later work packages. */
export type StageId =
  | 'acquire'
  | 'audio'
  | 'transcribe'
  | 'chapters'
  | 'concepts'
  | 'evidence'
  | 'relate'
  | 'trust'
  | 'index'
  | 'summary'
  | 'moments'
  | 'subtitles'
  | 'clips'
  | 'package';

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

/** How a stage is fulfilled: 'kmos' = a real KMOS operation ran; 'projection' = a
 * read-time projection over KMOS data; 'reference' = a deterministic reference
 * capability stood in for infra-dependent AI; 'external' = needs external infra
 * (yt-dlp/ffmpeg/Whisper) not present, reported honestly. */
export type StageMode = 'kmos' | 'projection' | 'reference' | 'external';

export interface StageState {
  readonly id: StageId;
  readonly label: string;
  status: StageStatus;
  mode: StageMode;
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
}

/** Where an episode came from. `rss`/`audio` are podcast-native; the rest mirror KS. */
export type EpisodeKind = 'rss' | 'audio' | 'youtube' | 'upload' | 'transcript';

export type EpisodeStatus = 'queued' | 'processing' | 'ready' | 'failed';

/** The job + outputs for one processed episode. Job state is app-local operational
 * state; the knowledge it produced is durable in KMOS. */
export interface Episode {
  readonly id: string;
  readonly kind: EpisodeKind;
  readonly title: string;
  /** Original reference (RSS/audio/YouTube URL, or upload name). */
  readonly reference: string;
  /** Podcast/show title when known (RSS). */
  show?: string;
  readonly targetLanguage?: string;
  status: EpisodeStatus;
  error?: string;
  /** Whether the user has starred this episode (daily-driver quick access). */
  favorite: boolean;
  readonly createdAt: string;
  updatedAt: string;
  readonly stages: StageState[];
  // --- Outputs (populated as the pipeline completes) ---
  segments: TranscriptSegment[];
  chapters: Chapter[];
  correctedTranscript?: string;
  translatedTranscript?: string;
  /** One-paragraph episode summary (added WP4). */
  summary?: string;
  /** Notable moments with timestamps (added WP4). */
  moments?: Moment[];
  /** Subtitle tracks (WP3) — real, generated offline. */
  subtitleSrt?: string;
  subtitleVtt?: string;
  /** Clip/reel plan (WP3) — render via ffmpeg on the estate. */
  clips?: ClipSpec[];
  conceptIds: CanonicalId[];
  /** KMOS Asset ids: source + transcript + subtitle. */
  sourceAssetId?: CanonicalId;
  transcriptAssetId?: CanonicalId;
  subtitleAssetId?: CanonicalId;
  durationSec: number;
}

/** A fully-resolved concept view — assembled at read time from KMOS (concept,
 * vocabulary, relationships, lineage, trust) plus the evidence-quote projection. */
export interface ConceptView {
  readonly id: CanonicalId;
  readonly name: string;
  readonly definition: string;
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly evidence: readonly EvidenceQuote[];
  readonly related: readonly RelatedConcept[];
  readonly lineage: readonly LineageNode[];
  readonly trust: TrustView;
  readonly vocabulary: readonly { language: string; term: string }[];
}

export interface RelatedConcept {
  readonly id: CanonicalId;
  readonly name: string;
  readonly relation: string;
  readonly direction: 'outgoing' | 'incoming';
}

export interface LineageNode {
  readonly assetId: CanonicalId;
  readonly label: string;
  readonly kind: string;
}

/** Explainable trust — reasons, never a bare score (UX principle). */
export interface TrustView {
  readonly trusted: boolean;
  readonly score: number;
  readonly reasons: readonly string[];
}

export type ClipKind = 'chapter' | 'highlight';

/** A clip specification — the deterministic plan of what to cut (render via ffmpeg). */
export interface ClipSpec {
  readonly id: string;
  readonly title: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly kind: ClipKind;
  readonly reason: string;
}

/** A notable moment in the episode, with a jump-to timestamp (added WP4). */
export interface Moment {
  readonly startSec: number;
  readonly endSec: number;
  readonly label: string;
  readonly reason: string;
}
