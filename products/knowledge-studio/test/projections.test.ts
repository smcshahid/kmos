import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript, detectChapters, findEvidence } from '@kmos/content-projections';
import { parseVideoId, resolveYouTube } from '../src/youtube.ts';

const TX = [
  '[00:00] Welcome to the session on memory and learning.',
  '[00:30] Encoding is how information first enters memory.',
  '[01:10] Retrieval practice strengthens memory more than rereading.',
  '[02:00] Spacing your practice across days improves retention.',
  '[03:00] Interleaving mixes problems and builds discrimination.',
  '[04:00] Working memory has a very limited capacity.',
].join('\n');

test('detectChapters yields a bounded, titled outline', () => {
  const segs = parseTranscript(TX);
  const chapters = detectChapters(segs, { targetSecondsPerChapter: 90, maxChapters: 6 });
  assert.ok(chapters.length >= 2 && chapters.length <= 6);
  assert.ok(chapters.every((c) => c.title.length > 0));
  assert.equal(chapters[0]!.segmentStart, 0);
  // chapters are contiguous and cover all segments
  assert.equal(chapters[chapters.length - 1]!.segmentEnd, segs.length - 1);
});

test('detectChapters on empty input is empty', () => {
  assert.deepEqual(detectChapters([]), []);
});

test('findEvidence locates the exact passage with a timestamp', () => {
  const segs = parseTranscript(TX);
  const ev = findEvidence(segs, 'Retrieval practice');
  assert.ok(ev.length >= 1);
  assert.match(ev[0]!.quote, /Retrieval practice/i);
  assert.equal(ev[0]!.startSec, 70);
  assert.ok(ev[0]!.timedExactly);
});

test('findEvidence ranks exact phrase above scattered words', () => {
  const segs = parseTranscript(TX);
  const ev = findEvidence(segs, 'Working memory', { maxQuotes: 3 });
  assert.match(ev[0]!.quote, /Working memory/i);
});

test('findEvidence returns nothing for an absent concept (no fabrication)', () => {
  const segs = parseTranscript(TX);
  assert.deepEqual(findEvidence(segs, 'photosynthesis'), []);
});

test('parseVideoId handles the common URL shapes', () => {
  assert.equal(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parseVideoId('not a url'), undefined);
});

test('resolveYouTube is honest: no captions unless a fetcher supplies them', () => {
  const bare = resolveYouTube('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(bare.videoId, 'dQw4w9WgXcQ');
  assert.equal(bare.captions, undefined);
  const fetched = resolveYouTube('https://youtu.be/dQw4w9WgXcQ', () => 'the captions text');
  assert.equal(fetched.captions, 'the captions text');
});
