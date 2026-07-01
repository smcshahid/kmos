/**
 * Transcript parsing (pure projection — no KMOS, no side effects).
 *
 * Turns raw transcript text into timestamped {@link TranscriptSegment}s, the atomic
 * unit that evidence quotes point at. Supports three honest input shapes:
 *   1. WebVTT / SRT-style cues  (`00:00:12.000 --> 00:00:15.000`)  — exact timing
 *   2. Leading-timestamp lines  (`[00:12:34] text`, `12:34 text`)  — exact timing
 *   3. Plain prose                                                  — ESTIMATED timing
 *
 * KCSI-02: identical to Knowledge Studio's `transcript.ts` — the second-consumer
 * evidence that this is a shared capability (candidate for extraction in WP7).
 */

import type { TranscriptSegment } from './types.js';

/** Words spoken per second used to estimate timing for un-timed prose (~150 wpm). */
const WORDS_PER_SECOND = 2.5;

const VTT_CUE = /(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)/;
const LEADING_TS = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.*\S)\s*$/;

/** Parse `hh:mm:ss(.ms)` or `mm:ss(.ms)` into whole seconds. */
export function parseTimecode(tc: string): number {
  const clean = tc.replace(',', '.').trim();
  const parts = clean.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return Math.round(sec);
}

/** Format whole seconds as `h:mm:ss` or `m:ss` for display. */
export function formatTimecode(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Split prose into sentence-ish spans, preserving terminal punctuation. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface ParseOptions {
  /** Total known duration in seconds (e.g. from media metadata) to scale estimates. */
  readonly knownDurationSec?: number;
}

/** Parse a raw transcript into timestamped segments. Never throws on odd input;
 * worst case returns a single estimated segment. */
export function parseTranscript(raw: string, opts: ParseOptions = {}): TranscriptSegment[] {
  const text = (raw ?? '').replace(/\r\n/g, '\n').trim();
  if (text.length === 0) return [];

  const vtt = parseVtt(text);
  if (vtt.length > 0) return finalizeExact(vtt);

  const leading = parseLeadingTimestamps(text);
  if (leading.length > 0) return finalizeExact(leading);

  return estimateFromProse(text, opts.knownDurationSec);
}

interface Timed { startSec: number; text: string }

function parseVtt(text: string): Timed[] {
  if (!VTT_CUE.test(text)) return [];
  const blocks = text.split(/\n\s*\n/);
  const out: Timed[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const cueLine = lines.find((l) => VTT_CUE.test(l));
    if (!cueLine) continue;
    const m = VTT_CUE.exec(cueLine);
    if (!m || m[1] === undefined) continue;
    const body = lines.filter((l) => l !== cueLine && l.toUpperCase() !== 'WEBVTT' && !/^\d+$/.test(l)).join(' ');
    if (body.trim().length === 0) continue;
    out.push({ startSec: parseTimecode(m[1]), text: stripTags(body) });
  }
  return out;
}

function parseLeadingTimestamps(text: string): Timed[] {
  const out: Timed[] = [];
  for (const line of text.split('\n')) {
    const m = LEADING_TS.exec(line);
    if (m && m[1] !== undefined && m[2] !== undefined) out.push({ startSec: parseTimecode(m[1]), text: m[2].trim() });
  }
  // Only treat as timestamped when the majority of non-empty lines carried a stamp.
  const nonEmpty = text.split('\n').filter((l) => l.trim().length > 0).length;
  return out.length >= Math.max(2, Math.ceil(nonEmpty * 0.6)) ? out : [];
}

function finalizeExact(timed: Timed[]): TranscriptSegment[] {
  const sorted = [...timed].sort((a, b) => a.startSec - b.startSec);
  return sorted.map((t, i) => {
    const next = sorted[i + 1];
    const endSec = next ? Math.max(t.startSec, next.startSec) : t.startSec + estimateSpan(t.text);
    return { index: i, startSec: t.startSec, endSec, text: t.text, timedExactly: true };
  });
}

function estimateFromProse(text: string, knownDurationSec?: number): TranscriptSegment[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return [{ index: 0, startSec: 0, endSec: estimateSpan(text), text, timedExactly: false }];
  const totalWords = sentences.reduce((n, s) => n + wordCount(s), 0);
  const scale = knownDurationSec && totalWords > 0 ? knownDurationSec / totalWords : 1 / WORDS_PER_SECOND;
  const segments: TranscriptSegment[] = [];
  let cursor = 0;
  sentences.forEach((s, i) => {
    const span = Math.max(1, Math.round(wordCount(s) * scale));
    segments.push({ index: i, startSec: Math.round(cursor), endSec: Math.round(cursor + span), text: s, timedExactly: false });
    cursor += span;
  });
  return segments;
}

function estimateSpan(text: string): number {
  return Math.max(1, Math.round(wordCount(text) / WORDS_PER_SECOND));
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Reconstruct the full plain transcript from segments. */
export function segmentsToText(segments: readonly TranscriptSegment[]): string {
  return segments.map((s) => s.text).join(' ');
}

/** Total covered duration in seconds. */
export function totalDuration(segments: readonly TranscriptSegment[]): number {
  return segments.length === 0 ? 0 : Math.max(...segments.map((s) => s.endSec));
}
