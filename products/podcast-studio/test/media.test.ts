import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSrt, toVtt } from '../src/subtitles.ts';
import { chapterClips, highlightReel } from '../src/clips.ts';
import { createPodcastPlatform } from '../src/platform.ts';
import { PodcastStudioService } from '../src/studio.ts';
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from '../src/sample.ts';
import type { TranscriptSegment, Chapter } from '../src/types.ts';

const segs: TranscriptSegment[] = [
  { index: 0, startSec: 0, endSec: 3, text: 'Hello and welcome.', timedExactly: true },
  { index: 1, startSec: 3, endSec: 7, text: 'Today we discuss retrieval practice.', timedExactly: true },
];

test('toSrt emits well-formed SubRip cues', () => {
  const srt = toSrt(segs);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:03,000\nHello and welcome\./);
  assert.match(srt, /2\n00:00:03,000 --> 00:00:07,000\nToday we discuss retrieval practice\./);
});

test('toVtt emits a WEBVTT header and dotted timestamps', () => {
  const vtt = toVtt(segs);
  assert.match(vtt, /^WEBVTT\n\n/);
  assert.match(vtt, /00:00:00\.000 --> 00:00:03\.000/);
});

test('chapterClips produces one clip per chapter', () => {
  const chapters: Chapter[] = [
    { id: 'ch-1', title: 'Intro', startSec: 0, endSec: 60, segmentStart: 0, segmentEnd: 3 },
    { id: 'ch-2', title: 'Retrieval', startSec: 60, endSec: 120, segmentStart: 4, segmentEnd: 8 },
  ];
  const clips = chapterClips(chapters);
  assert.equal(clips.length, 2);
  assert.equal(clips[0]!.kind, 'chapter');
  assert.equal(clips[1]!.title, 'Retrieval');
});

test('highlightReel is bounded and pads around spans', () => {
  const reel = highlightReel([{ startSec: 30, endSec: 34, label: 'Spacing' }], segs, { maxClips: 5, padSec: 2 });
  assert.equal(reel.length, 1);
  assert.equal(reel[0]!.kind, 'highlight');
  assert.equal(reel[0]!.startSec, 28);
  assert.equal(reel[0]!.endSec, 36);
});

test('the pipeline produces real subtitles + a clip plan with lineage', async () => {
  const studio = new PodcastStudioService(createPodcastPlatform());
  const ep = await studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
  assert.equal(ep.status, 'ready', ep.error ?? '');
  assert.match(ep.subtitleSrt ?? '', /-->/);
  assert.match(ep.subtitleVtt ?? '', /^WEBVTT/);
  assert.ok(ep.subtitleAssetId, 'subtitle registered as a KMOS asset');
  assert.ok((ep.clips ?? []).length >= ep.chapters.length, 'at least one clip per chapter');
  assert.ok((ep.clips ?? []).some((c) => c.kind === 'highlight'), 'a highlight reel was planned');
});
