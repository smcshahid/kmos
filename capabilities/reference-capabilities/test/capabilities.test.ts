import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transcription, translation, knowledgeExtraction, rendering, referenceCapabilities,
} from '../src/index.js';

const ctx = {};

test('transcription produces a deterministic transcript (KMOS-0004)', async () => {
  const h = transcription.create();
  assert.equal(h.health(), 'Ready');
  const out = await h.invoke({ audioRef: 'kmos:Asset:x', language: 'en' }, ctx);
  assert.match(out.transcript, /transcript of kmos:Asset:x/);
  assert.equal(out.language, 'en');
});

test('translation prefixes target language', async () => {
  const out = await translation.create().invoke({ text: 'hello', targetLanguage: 'ar' }, ctx);
  assert.equal(out.text, '[ar] hello');
});

test('knowledge extraction finds capitalized concepts deterministically', async () => {
  const out = await knowledgeExtraction.create().invoke({ text: 'Sincerity leads to Purification and Sincerity again' }, ctx);
  const names = out.concepts.map((c) => c.canonicalName).sort();
  assert.deepEqual(names, ['Purification', 'Sincerity']); // de-duplicated
});

test('rendering is reproducible: same storyboard -> same checksum', async () => {
  const h = rendering.create();
  const a = await h.invoke({ storyboard: 'scene-1|scene-2' }, ctx);
  const b = await h.invoke({ storyboard: 'scene-1|scene-2' }, ctx);
  assert.equal(a.checksum, b.checksum);
  assert.notEqual(a.checksum, (await h.invoke({ storyboard: 'different' }, ctx)).checksum);
});

test('all reference capabilities expose a valid descriptor + handler (KMOS-0120 §6)', () => {
  assert.equal(referenceCapabilities.length, 4);
  for (const cap of referenceCapabilities) {
    assert.ok(cap.descriptor.name && cap.descriptor.version && cap.descriptor.contract);
    const h = cap.create();
    assert.equal(typeof h.invoke, 'function');
    assert.equal(typeof h.health, 'function');
  }
});
