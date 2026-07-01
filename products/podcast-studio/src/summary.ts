/**
 * Summarization (deterministic reference — no KMOS, no network).
 *
 * Produces a short extractive summary by selecting the most concept-dense sentences,
 * preserving original order. This is the OFFLINE reference; an LLM summarizer (Ollama/
 * hosted) is a drop-in provider on the estate. Deterministic and honest: it never
 * invents sentences — every sentence in the summary is verbatim from the transcript.
 *
 * KCSI-02 WP4: summarization is a candidate capability (LLM provider behind a contract).
 */

import type { TranscriptSegment } from './types.js';

interface SummaryOptions {
  readonly maxSentences?: number;
}

/** Extractive summary: the top concept-dense sentences, in original order. */
export function extractiveSummary(
  segments: readonly TranscriptSegment[],
  conceptNames: readonly string[],
  opts: SummaryOptions = {},
): string {
  const max = opts.maxSentences ?? 4;
  if (segments.length === 0) return '';
  const names = conceptNames.map((n) => n.toLowerCase()).filter((n) => n.length > 0);
  const total = segments.length;

  const scored = segments.map((seg, i) => {
    const hay = seg.text.toLowerCase();
    let score = 0;
    for (const n of names) if (hay.includes(n)) score += 3;
    // Mild lead bias: earlier sentences tend to frame the episode.
    score += Math.max(0, 2 - Math.floor((i / total) * 3));
    // Prefer sentences of a quotable length (not too short, not rambling).
    const wc = seg.text.split(/\s+/).filter(Boolean).length;
    if (wc >= 6 && wc <= 40) score += 1;
    return { i, score, text: seg.text.trim() };
  });

  const chosen = [...scored]
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, Math.min(max, total))
    .sort((a, b) => a.i - b.i);

  return chosen.map((c) => c.text).join(' ');
}
