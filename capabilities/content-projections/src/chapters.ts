/**
 * Chapter detection (pure projection — no side effects).
 *
 * Groups timestamped segments into a small, readable outline. Deterministic and honest:
 * these are AUTO chapters. Prefers natural breaks (longer pauses) and falls back to even
 * distribution so any source yields a usable outline.
 */

import type { Chapter, TranscriptSegment } from './types.js';

interface ChapterOptions {
  readonly targetSecondsPerChapter?: number;
  readonly minChapters?: number;
  readonly maxChapters?: number;
}

export function detectChapters(segments: readonly TranscriptSegment[], opts: ChapterOptions = {}): Chapter[] {
  if (segments.length === 0) return [];
  const target = opts.targetSecondsPerChapter ?? 120;
  const minCh = opts.minChapters ?? 2;
  const maxCh = opts.maxChapters ?? 12;
  const duration = Math.max(...segments.map((s) => s.endSec)) - segments[0]!.startSec;
  const desired = clamp(Math.round(duration / target) || 1, Math.min(minCh, segments.length), Math.min(maxCh, segments.length));

  const boundaries = pickBoundaries(segments, desired);
  const chapters: Chapter[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i]!;
    const end = (boundaries[i + 1] ?? segments.length) - 1;
    const first = segments[start]!;
    const last = segments[end]!;
    chapters.push({
      id: `ch-${i + 1}`,
      title: titleFor(segments, start),
      startSec: first.startSec,
      endSec: last.endSec,
      segmentStart: start,
      segmentEnd: end,
    });
  }
  return chapters;
}

function pickBoundaries(segments: readonly TranscriptSegment[], count: number): number[] {
  if (count <= 1) return [0];
  const gaps: { index: number; gap: number }[] = [];
  for (let i = 1; i < segments.length; i++) {
    gaps.push({ index: i, gap: segments[i]!.startSec - segments[i - 1]!.endSec });
  }
  const minSpacing = Math.max(1, Math.floor(segments.length / (count * 2)));
  const chosen = new Set<number>([0]);
  const anyExactGap = gaps.some((g) => g.gap > 0);
  if (anyExactGap) {
    for (const g of [...gaps].sort((a, b) => b.gap - a.gap)) {
      if (chosen.size >= count) break;
      if (g.gap <= 0) break;
      if ([...chosen].every((c) => Math.abs(c - g.index) >= minSpacing)) chosen.add(g.index);
    }
  }
  if (chosen.size < count) {
    const step = segments.length / count;
    for (let i = 1; i < count; i++) chosen.add(Math.round(i * step));
  }
  return [...chosen].sort((a, b) => a - b).slice(0, count);
}

function titleFor(segments: readonly TranscriptSegment[], startIndex: number): string {
  const raw = segments[startIndex]!.text.replace(/\s+/g, ' ').trim();
  const clause = raw.split(/[,.;:—]/)[0]!.trim();
  const words = clause.split(' ').slice(0, 9).join(' ');
  const title = words.length > 60 ? `${words.slice(0, 57).trim()}…` : words;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
