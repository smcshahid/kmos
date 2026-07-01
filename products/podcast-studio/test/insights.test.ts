import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractiveSummary } from '../src/summary.ts';
import { detectMoments } from '../src/moments.ts';
import { createPodcastPlatform } from '../src/platform.ts';
import { PodcastStudioService } from '../src/studio.ts';
import { SAMPLE_TITLE, SAMPLE_TRANSCRIPT } from '../src/sample.ts';
import type { TranscriptSegment } from '../src/types.ts';

const segs: TranscriptSegment[] = [
  { index: 0, startSec: 0, endSec: 4, text: 'Welcome to the show about learning.', timedExactly: true },
  { index: 1, startSec: 4, endSec: 9, text: 'Retrieval practice strengthens memory more than rereading.', timedExactly: true },
  { index: 2, startSec: 9, endSec: 14, text: 'Why does spacing work so well for retention?', timedExactly: true },
  { index: 3, startSec: 14, endSec: 18, text: 'The key takeaway is to space your practice over time.', timedExactly: true },
];

test('extractiveSummary is verbatim and concept-biased', () => {
  const s = extractiveSummary(segs, ['Retrieval practice', 'spacing'], { maxSentences: 2 });
  assert.ok(s.length > 0);
  // Every chosen sentence must be verbatim from the transcript (no fabrication).
  for (const sentence of s.split(/(?<=[.?])\s+/)) {
    assert.ok(segs.some((seg) => seg.text.includes(sentence.trim())), `verbatim: ${sentence}`);
  }
});

test('detectMoments finds questions and concept-dense moments, chronological', () => {
  const moments = detectMoments(segs, ['Retrieval practice', 'spacing']);
  assert.ok(moments.length >= 2);
  for (let i = 1; i < moments.length; i++) assert.ok(moments[i]!.startSec >= moments[i - 1]!.startSec);
  assert.ok(moments.some((m) => m.reason === 'Question / hook'), 'the question moment is detected');
});

test('the pipeline attaches a summary, moments, and a moment-driven reel', async () => {
  const studio = new PodcastStudioService(createPodcastPlatform());
  const ep = await studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
  assert.equal(ep.status, 'ready', ep.error ?? '');
  assert.ok((ep.summary ?? '').length > 0, 'summary produced');
  assert.ok((ep.moments ?? []).length > 0, 'moments detected');
  const reel = (ep.clips ?? []).filter((c) => c.kind === 'highlight');
  assert.ok(reel.length > 0, 'highlight reel planned from moments');
});
