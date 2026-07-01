/**
 * Evidence grounding (pure projection — no KMOS, no side effects).
 *
 * Given a concept term and the source transcript, find the exact passages where
 * the concept is discussed, each with a jump-to-moment timestamp. This is a READ-
 * TIME PROJECTION over the transcript Asset that KMOS already records as the
 * concept's evidence ref — we surface *where* the idea appears; we never fabricate
 * a quote. A concept with no locatable passage returns no evidence (the UI then
 * marks it honestly as low-evidence rather than inventing one).
 */

import type { EvidenceQuote, TranscriptSegment } from './types.js';

interface EvidenceOptions {
  readonly maxQuotes?: number;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has',
  'have', 'had', 'not', 'but', 'you', 'your', 'they', 'their', 'its', 'our', 'can',
  'will', 'would', 'about', 'into', 'these', 'those', 'them', 'then', 'than',
]);

/** Locate up to `maxQuotes` best evidence passages for a term, best-first. */
export function findEvidence(
  segments: readonly TranscriptSegment[],
  term: string,
  opts: EvidenceOptions = {},
): EvidenceQuote[] {
  const maxQuotes = opts.maxQuotes ?? 3;
  const phrase = term.toLowerCase().trim();
  const words = phrase.split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (phrase.length === 0) return [];

  const scored: { seg: TranscriptSegment; score: number }[] = [];
  for (const seg of segments) {
    const hay = seg.text.toLowerCase();
    let score = 0;
    if (hay.includes(phrase)) score += 100; // exact phrase — strongest evidence
    for (const w of words) {
      if (new RegExp(`\\b${escapeRegExp(w)}\\b`).test(hay)) score += 10;
    }
    // Slightly prefer shorter, quotable segments among equal matches.
    if (score > 0) {
      score += Math.max(0, 5 - Math.floor(wordCount(seg.text) / 25));
      scored.push({ seg, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.seg.startSec - b.seg.startSec)
    .slice(0, maxQuotes)
    .map(({ seg }) => ({
      quote: seg.text.trim(),
      startSec: seg.startSec,
      endSec: seg.endSec,
      segmentIndex: seg.index,
      timedExactly: seg.timedExactly,
    }));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
