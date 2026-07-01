/**
 * Clip & reel planning (pure projection — no KMOS, no ffmpeg).
 *
 * Produces *clip specifications* — the deterministic plan of what to cut (start/end/
 * title/reason) from chapters and highlight moments. The actual video/audio render
 * runs via an ffmpeg capability on the estate; the plan here is real and offline, so
 * the product can show and export a clip list even without a media engine.
 *
 * KCSI-02 WP3: clip planning is a candidate capability; render is a provider (external).
 */

import type { Chapter, ClipSpec, TranscriptSegment } from './types.js';

/** One clip per chapter — the reliable, structural cut list. */
export function chapterClips(chapters: readonly Chapter[]): ClipSpec[] {
  return chapters.map((ch, i) => ({
    id: `clip-ch-${i + 1}`,
    title: ch.title,
    startSec: ch.startSec,
    endSec: ch.endSec,
    kind: 'chapter',
    reason: `Chapter ${i + 1}`,
  }));
}

export interface HighlightSpan {
  readonly startSec: number;
  readonly endSec: number;
  readonly label: string;
}

/**
 * A short highlight reel: bounded short clips around the most notable moments. Given
 * highlight spans (e.g. from moment detection or evidence), produce capped clip specs.
 * Deterministic; when no spans are supplied, falls back to the first segments so a reel
 * always exists.
 */
export function highlightReel(
  spans: readonly HighlightSpan[],
  segments: readonly TranscriptSegment[],
  opts: { maxClips?: number; padSec?: number } = {},
): ClipSpec[] {
  const maxClips = opts.maxClips ?? 5;
  const pad = opts.padSec ?? 2;
  const source = spans.length > 0
    ? spans
    : segments.slice(0, maxClips).map((s) => ({ startSec: s.startSec, endSec: s.endSec, label: s.text.slice(0, 40) }));
  return source
    .slice(0, maxClips)
    .map((sp, i) => ({
      id: `clip-hl-${i + 1}`,
      title: sp.label.trim() || `Highlight ${i + 1}`,
      startSec: Math.max(0, sp.startSec - pad),
      endSec: Math.max(sp.startSec + 1, sp.endSec + pad),
      kind: 'highlight' as const,
      reason: 'Highlight moment',
    }));
}
