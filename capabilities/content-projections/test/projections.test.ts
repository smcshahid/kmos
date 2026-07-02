import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTranscript, parseTimecode, formatTimecode, splitSentences, segmentsToText, totalDuration,
  detectChapters, findEvidence,
} from '../src/index.js';

test('parseTimecode / formatTimecode round-trip mm:ss and hh:mm:ss', () => {
  assert.equal(parseTimecode('12:34'), 12 * 60 + 34);
  assert.equal(parseTimecode('01:02:03'), 3723);
  assert.equal(formatTimecode(3723), '1:02:03');
  assert.equal(formatTimecode(62), '1:02');
});

test('leading-timestamp lines parse with EXACT timing', () => {
  const segs = parseTranscript('[00:00] hello there friend\n[00:05] second line here now');
  assert.equal(segs.length, 2);
  assert.equal(segs[0]!.timedExactly, true);
  assert.equal(segs[1]!.startSec, 5);
});

test('WebVTT cues parse with exact timing', () => {
  const segs = parseTranscript('WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nHello\n\n00:00:03.000 --> 00:00:06.000\nWorld');
  assert.equal(segs.length, 2);
  assert.equal(segs[0]!.text, 'Hello');
  assert.equal(segs[1]!.startSec, 3);
});

test('plain prose gets ESTIMATED, monotonic timing', () => {
  const segs = parseTranscript('First sentence here. Second sentence follows. Third one ends.');
  assert.ok(segs.length >= 3);
  assert.equal(segs.every((s) => s.timedExactly === false), true);
  for (let i = 1; i < segs.length; i++) assert.ok(segs[i]!.startSec >= segs[i - 1]!.startSec);
});

test('segmentsToText + totalDuration + splitSentences', () => {
  const segs = parseTranscript('[00:00] alpha beta gamma\n[00:10] delta epsilon zeta');
  assert.match(segmentsToText(segs), /alpha beta gamma delta/);
  assert.ok(totalDuration(segs) >= 10);
  assert.equal(splitSentences('One. Two! Three?').length, 3);
});

test('detectChapters yields a bounded, titled outline', () => {
  const segs = parseTranscript(Array.from({ length: 20 }, (_, i) => `[${String(i).padStart(2, '0')}:00] Topic ${i} discussion content here`).join('\n'));
  const chapters = detectChapters(segs);
  assert.ok(chapters.length >= 2 && chapters.length <= 12);
  assert.ok(chapters.every((c) => c.title.length > 0));
});

test('findEvidence locates the exact passage and never fabricates', () => {
  const segs = parseTranscript('[00:00] We discuss retrieval practice today\n[00:05] Spacing improves retention greatly');
  const ev = findEvidence(segs, 'retrieval practice');
  assert.ok(ev.length >= 1);
  assert.match(ev[0]!.quote, /retrieval practice/i);
  assert.deepEqual(findEvidence(segs, 'quantum chromodynamics'), []); // absent → nothing
});
