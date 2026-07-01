/**
 * Knowledge Studio — product-facing types.
 *
 * These describe the PRODUCT's read models and job state — the "understanding"
 * a user leaves with. The canonical business objects (Concept, Asset, Evidence,
 * Trust, Collection) live in KMOS; the types here are thin projections/orchestration
 * state the application owns. No business logic lives in this layer (KMOS-9999 §9).
 */

import type { CanonicalId } from '@kmos/canonical-kernel';

/** A timestamped span of the transcript — the atomic unit evidence points at. */
export interface TranscriptSegment {
  readonly index: number;
  /** Start time in whole seconds from the beginning of the source. */
  readonly startSec: number;
  readonly endSec: number;
  readonly text: string;
  /** True when the timestamp was carried by the source, false when estimated. */
  readonly timedExactly: boolean;
}

/** A readable chapter — a contiguous run of segments under one heading. */
export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly segmentStart: number;
  readonly segmentEnd: number;
}

/** An evidence quote: the exact transcript passage grounding a concept, with a
 * jump-to-moment timestamp. Projected over the KMOS transcript Asset (the concept's
 * canonical evidence ref), never fabricated. */
export interface EvidenceQuote {
  readonly quote: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly segmentIndex: number;
  /** Whether the moment is exact (from source timing) or estimated. */
  readonly timedExactly: boolean;
}

/** The processing pipeline stages, in order. Some require external infra and are
 * honestly reported as such (see PipelineStage.mode). */
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
  | 'package';

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

/** How a stage is fulfilled: 'kmos' = a real KMOS operation ran; 'projection' =
 * a read-time projection over KMOS data; 'reference' = a deterministic reference
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

export type SourceKind = 'youtube' | 'upload' | 'transcript';

export type SourceStatus = 'queued' | 'processing' | 'ready' | 'failed';

/** The job + outputs for one processed source. Job state is app-local operational
 * state; the knowledge it produced is durable in KMOS. */
export interface Source {
  readonly id: string;
  readonly kind: SourceKind;
  readonly title: string;
  /** Original reference (YouTube URL or upload name). */
  readonly reference: string;
  readonly targetLanguage?: string;
  status: SourceStatus;
  error?: string;
  readonly createdAt: string;
  updatedAt: string;
  readonly stages: StageState[];
  // --- Outputs (populated as the pipeline completes) ---
  segments: TranscriptSegment[];
  chapters: Chapter[];
  correctedTranscript?: string;
  translatedTranscript?: string;
  /** KMOS Concept ids produced from this source. */
  conceptIds: CanonicalId[];
  /** KMOS Asset ids: [sourceAssetId, transcriptAssetId]. */
  sourceAssetId?: CanonicalId;
  transcriptAssetId?: CanonicalId;
  durationSec: number;
}

/** A fully-resolved concept view — the heart of the product. Assembled at read
 * time from KMOS (concept, vocabulary, relationships, lineage, trust) plus the
 * evidence-quote projection over the transcript. */
export interface ConceptView {
  readonly id: CanonicalId;
  readonly name: string;
  readonly definition: string;
  readonly sourceId: string;
  readonly sourceTitle: string;
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
