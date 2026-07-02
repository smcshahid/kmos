import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOllamaExtraction } from '../src/index.js';

const ctx = {};

/** Fake Ollama /api/chat response carrying the given concepts. */
function fakeOllama(concepts: Array<{ canonicalName: string; definition: string }>): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => ({ message: { content: JSON.stringify({ concepts }) } }),
  })) as unknown as typeof fetch;
}
const failingFetch = (async () => { throw new Error('ollama down'); }) as unknown as typeof fetch;
const notOkFetch = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
const malformedFetch = (async () => ({
  ok: true, json: async () => ({ message: { content: 'not json{' } }),
})) as unknown as typeof fetch;

test('descriptor advertises the KnowledgeExtraction contract (Transcript -> Concept)', () => {
  const cap = createOllamaExtraction({ url: 'http://ollama:11434' });
  assert.equal(cap.descriptor.name, 'KnowledgeExtractionOllama');
  assert.equal(cap.descriptor.ownerDomain, 'Knowledge');
  assert.deepEqual([...cap.descriptor.contract.acceptedObjects], ['Transcript']);
  assert.deepEqual([...cap.descriptor.contract.producedObjects], ['Concept']);
});

test('returns the LLM concepts when Ollama responds usefully', async () => {
  const cap = createOllamaExtraction({
    url: 'http://ollama:11434',
    fetchImpl: fakeOllama([
      { canonicalName: 'Retrieval Practice', definition: 'Recalling material strengthens memory.' },
      { canonicalName: 'Spacing', definition: 'Distributing study over time improves retention.' },
    ]),
  });
  const out = await cap.create().invoke({ text: 'lecture about memory' }, ctx);
  assert.deepEqual(out.concepts.map((c) => c.canonicalName), ['Retrieval Practice', 'Spacing']);
});

test('falls back to the reference extractor when the LLM throws', async () => {
  const cap = createOllamaExtraction({ url: 'http://ollama:11434', fetchImpl: failingFetch });
  const out = await cap.create().invoke({ text: 'Sincerity leads to Purification and Discipline' }, ctx);
  // Reference extractor: capitalized words > 4 chars become concepts, deterministically.
  assert.ok(out.concepts.length > 0, 'reference fallback still produced concepts');
  assert.ok(out.concepts.some((c) => c.canonicalName === 'Sincerity'));
});

test('falls back on empty LLM output (usable predicate: concepts.length > 0)', async () => {
  const cap = createOllamaExtraction({ url: 'http://ollama:11434', fetchImpl: fakeOllama([]) });
  const out = await cap.create().invoke({ text: 'Sincerity and Purification' }, ctx);
  assert.ok(out.concepts.length > 0);
});

test('falls back on a non-2xx response', async () => {
  const cap = createOllamaExtraction({ url: 'http://ollama:11434', fetchImpl: notOkFetch });
  const out = await cap.create().invoke({ text: 'Discipline and Patience' }, ctx);
  assert.ok(out.concepts.length > 0);
});

test('falls back on malformed JSON from the model', async () => {
  const cap = createOllamaExtraction({ url: 'http://ollama:11434', fetchImpl: malformedFetch });
  const out = await cap.create().invoke({ text: 'Knowledge and Wisdom' }, ctx);
  assert.ok(out.concepts.length > 0);
});

test('respects maxConcepts', async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ canonicalName: `Concept${i}`, definition: 'd' }));
  const cap = createOllamaExtraction({ url: 'http://ollama:11434', maxConcepts: 5, fetchImpl: fakeOllama(many) });
  const out = await cap.create().invoke({ text: 'x' }, ctx);
  assert.equal(out.concepts.length, 5);
});
