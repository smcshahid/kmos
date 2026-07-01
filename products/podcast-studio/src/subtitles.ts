/**
 * Subtitle generation (pure projection — no KMOS, no side effects, no ffmpeg).
 *
 * Turns timestamped transcript segments into standard subtitle tracks (SRT + WebVTT).
 * This is a genuine offline capability — no media engine required — so Podcast Studio
 * produces real, downloadable subtitle files even without any provider configured.
 *
 * KCSI-02 WP3: a candidate shared capability (Knowledge Studio would want the same).
 */

import type { TranscriptSegment } from './types.js';

/** Render `hh:mm:ss,mmm` (SRT) or `hh:mm:ss.mmm` (VTT) from whole/real seconds. */
function stamp(totalSec: number, sep: ',' | '.'): string {
  const s = Math.max(0, totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(h)}:${p2(m)}:${p2(sec)}${sep}${String(ms).padStart(3, '0')}`;
}

/** Ensure each cue has a positive, non-overlapping duration for well-formed output. */
function cueEnd(seg: TranscriptSegment, next?: TranscriptSegment): number {
  const minEnd = seg.startSec + 1;
  const end = seg.endSec > seg.startSec ? seg.endSec : minEnd;
  return next ? Math.min(end, Math.max(next.startSec, minEnd)) : end;
}

/** Generate a SubRip (.srt) subtitle track. */
export function toSrt(segments: readonly TranscriptSegment[]): string {
  return segments
    .map((seg, i) => {
      const end = cueEnd(seg, segments[i + 1]);
      return `${i + 1}\n${stamp(seg.startSec, ',')} --> ${stamp(end, ',')}\n${seg.text.trim()}\n`;
    })
    .join('\n');
}

/** Generate a WebVTT (.vtt) subtitle track. */
export function toVtt(segments: readonly TranscriptSegment[]): string {
  const cues = segments
    .map((seg, i) => {
      const end = cueEnd(seg, segments[i + 1]);
      return `${stamp(seg.startSec, '.')} --> ${stamp(end, '.')}\n${seg.text.trim()}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${cues}\n`;
}
