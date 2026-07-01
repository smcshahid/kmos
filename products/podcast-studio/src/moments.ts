/**
 * Moment detection (deterministic reference — no KMOS, no network).
 *
 * Finds the notable moments of an episode — the timestamps worth jumping to or clipping.
 * The OFFLINE reference scores segments by concept density and rhetorical signals
 * (questions, emphasis); an LLM moment-detector is a drop-in provider on the estate.
 * Deterministic and honest: every moment points at a real transcript segment.
 *
 * KCSI-02 WP4: moment detection is a candidate capability (LLM provider behind a contract).
 */

import type { Moment, TranscriptSegment } from './types.js';

interface MomentOptions {
  readonly maxMoments?: number;
}

/** Detect up to `maxMoments` notable moments, best-first then chronological. */
export function detectMoments(
  segments: readonly TranscriptSegment[],
  conceptNames: readonly string[],
  opts: MomentOptions = {},
): Moment[] {
  const max = opts.maxMoments ?? 6;
  if (segments.length === 0) return [];
  const names = conceptNames.map((n) => n.toLowerCase()).filter((n) => n.length > 0);

  const scored = segments.map((seg) => {
    const hay = seg.text.toLowerCase();
    let score = 0;
    const hits = names.filter((n) => hay.includes(n));
    score += hits.length * 3;
    if (/\?/.test(seg.text)) score += 2; // a question is often a hook
    if (/\b(important|key|remember|the point is|crucially|takeaway)\b/i.test(seg.text)) score += 2;
    return { seg, score, label: hits[0] ?? seg.text.slice(0, 48).trim() };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.seg.startSec - b.seg.startSec)
    .slice(0, max)
    .sort((a, b) => a.seg.startSec - b.seg.startSec)
    .map((s) => ({
      startSec: s.seg.startSec,
      endSec: s.seg.endSec,
      label: capitalize(s.label),
      reason: /\?/.test(s.seg.text) ? 'Question / hook' : 'Concept-dense moment',
    }));
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
