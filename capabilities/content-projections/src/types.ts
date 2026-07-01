/**
 * Shared content-projection types (KCSI-02).
 *
 * The atomic units both Knowledge Studio and Podcast Studio project over a transcript.
 * Extracted verbatim from each app's local definitions once two consumers proved these
 * are a shared capability, not app-local shapes.
 */

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
 * jump-to-moment timestamp. Projected over the transcript, never fabricated. */
export interface EvidenceQuote {
  readonly quote: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly segmentIndex: number;
  /** Whether the moment is exact (from source timing) or estimated. */
  readonly timedExactly: boolean;
}
