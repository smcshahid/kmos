import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudioPlatform } from '../src/platform.ts';
import { StudioService } from '../src/studio.ts';
import { createOllamaExtraction } from '@kmos/providers';
import { SAMPLE_TRANSCRIPT, SAMPLE_TITLE } from '../src/sample.ts';

/** A fake fetch that returns an Ollama /api/chat response with the given concepts. */
function fakeOllama(concepts: Array<{ canonicalName: string; definition: string }>): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => ({ message: { content: JSON.stringify({ concepts }) } }),
  })) as unknown as typeof fetch;
}

const failingFetch = (async () => { throw new Error('ollama down'); }) as unknown as typeof fetch;

async function processWith(extraction: ReturnType<typeof createOllamaExtraction>) {
  const studio = new StudioService(createStudioPlatform({ extraction }));
  return studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
}

test('injected LLM extraction feeds richer concepts through the KMOS pipeline', async () => {
  const extraction = createOllamaExtraction({
    url: 'http://ollama:11434',
    fetchImpl: fakeOllama([
      { canonicalName: 'Retrieval Practice', definition: 'Recalling material strengthens memory more than rereading.' },
      { canonicalName: 'Spacing', definition: 'Distributing study over time improves retention.' },
    ]),
  });
  const studio = new StudioService(createStudioPlatform({ extraction }));
  const src = await studio.submitAndProcess({ kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE, transcript: SAMPLE_TRANSCRIPT });
  assert.equal(src.status, 'ready', src.error ?? '');
  const names = studio.conceptSummaries(src.id).map((c) => c.name);
  assert.ok(names.includes('Retrieval Practice'), `expected LLM concept; got ${names.join(', ')}`);
  // The multi-word concept is grounded to its exact passage in the transcript.
  const view = studio.conceptView(studio.conceptSummaries(src.id).find((c) => c.name === 'Retrieval Practice')!.id)!;
  assert.ok(view.definition.length > 0);
  assert.ok(view.evidence.length >= 1);
});

test('falls back to the reference extractor when the LLM fails (processing never breaks)', async () => {
  const extraction = createOllamaExtraction({ url: 'http://ollama:11434', fetchImpl: failingFetch });
  const src = await processWith(extraction);
  assert.equal(src.status, 'ready', src.error ?? '');
  assert.ok(src.conceptIds.length > 0, 'reference fallback still produced concepts');
});

test('empty LLM output also falls back rather than yielding nothing', async () => {
  const extraction = createOllamaExtraction({ url: 'http://ollama:11434', fetchImpl: fakeOllama([]) });
  const src = await processWith(extraction);
  assert.equal(src.status, 'ready', src.error ?? '');
  assert.ok(src.conceptIds.length > 0);
});
