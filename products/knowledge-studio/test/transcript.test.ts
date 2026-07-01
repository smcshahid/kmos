import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTranscript, parseTimecode, formatTimecode, splitSentences, totalDuration,
} from '../src/transcript.ts';

test('parseTimecode handles mm:ss and hh:mm:ss', () => {
  assert.equal(parseTimecode('12:34'), 754);
  assert.equal(parseTimecode('1:02:03'), 3723);
  assert.equal(parseTimecode('00:00:15.500'), 16);
});

test('formatTimecode is human and tabular', () => {
  assert.equal(formatTimecode(75), '1:15');
  assert.equal(formatTimecode(3723), '1:02:03');
  assert.equal(formatTimecode(0), '0:00');
});

test('leading-timestamp lines parse with EXACT timing', () => {
  const segs = parseTranscript('[00:00] Hello there.\n[00:12] Second line here.\n[00:31] Third and final.');
  assert.equal(segs.length, 3);
  assert.equal(segs[0]!.startSec, 0);
  assert.equal(segs[1]!.startSec, 12);
  assert.equal(segs[1]!.endSec, 31); // ends where the next begins
  assert.ok(segs.every((s) => s.timedExactly), 'all exact');
});

test('WebVTT cues parse with exact timing', () => {
  const vtt = 'WEBVTT\n\n1\n00:00:00.000 --> 00:00:04.000\nWelcome to the talk.\n\n2\n00:00:04.000 --> 00:00:09.000\nToday we discuss memory.';
  const segs = parseTranscript(vtt);
  assert.equal(segs.length, 2);
  assert.equal(segs[0]!.startSec, 0);
  assert.equal(segs[1]!.startSec, 4);
  assert.match(segs[1]!.text, /memory/);
  assert.ok(segs.every((s) => s.timedExactly));
});

test('plain prose gets ESTIMATED, monotonic timing', () => {
  const segs = parseTranscript('Encoding is first. Storage keeps it. Retrieval gets it back.');
  assert.equal(segs.length, 3);
  assert.ok(segs.every((s) => !s.timedExactly), 'all estimated');
  assert.ok(segs[1]!.startSec >= segs[0]!.endSec - 1, 'timing advances');
  assert.ok(totalDuration(segs) > 0);
});

test('splitSentences keeps punctuation and drops empties', () => {
  const s = splitSentences('One thing. Two things! Three?  ');
  assert.deepEqual(s, ['One thing.', 'Two things!', 'Three?']);
});

test('empty input yields no segments', () => {
  assert.deepEqual(parseTranscript(''), []);
  assert.deepEqual(parseTranscript('   \n  '), []);
});
