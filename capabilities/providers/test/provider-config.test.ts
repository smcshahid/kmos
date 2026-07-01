import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOpenAiCompatibleExtraction,
  createKnowledgeExtractionFromConfig,
  extractionConfigFromEnv,
} from '../src/index.js';

const ctx = {};

/** Fake OpenAI-compatible /chat/completions response with the given concepts. */
function fakeOpenAi(concepts: Array<{ canonicalName: string; definition: string }>, capture?: (url: string, init: any) => void): typeof fetch {
  return (async (url: string, init: any) => {
    capture?.(url, init);
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ concepts }) } }] }),
    };
  }) as unknown as typeof fetch;
}
const failing = (async () => { throw new Error('provider down'); }) as unknown as typeof fetch;

test('openai-compatible adapter calls /chat/completions with auth + returns concepts', async () => {
  let seenUrl = ''; let seenAuth = '';
  const cap = createOpenAiCompatibleExtraction({
    baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini',
    fetchImpl: fakeOpenAi([{ canonicalName: 'Spacing', definition: 'Distributing study over time.' }],
      (u, i) => { seenUrl = u; seenAuth = i.headers.Authorization; }),
  });
  const out = await cap.create().invoke({ text: 'a lecture' }, ctx);
  assert.equal(seenUrl, 'https://api.openai.com/v1/chat/completions');
  assert.equal(seenAuth, 'Bearer sk-test');
  assert.deepEqual(out.concepts.map((c) => c.canonicalName), ['Spacing']);
});

test('openai-compatible adapter falls back to the reference extractor on error', async () => {
  const cap = createOpenAiCompatibleExtraction({ baseUrl: 'https://api.openai.com/v1', fetchImpl: failing });
  const out = await cap.create().invoke({ text: 'Sincerity and Discipline matter' }, ctx);
  assert.ok(out.concepts.length > 0, 'reference fallback produced concepts');
});

test('the config factory selects the right adapter — switching provider is config-only', () => {
  // Same application code; only the config changes.
  assert.equal(createKnowledgeExtractionFromConfig({ provider: 'reference' }), undefined); // domain default
  const ollama = createKnowledgeExtractionFromConfig({ provider: 'ollama', baseUrl: 'http://ollama:11434' });
  assert.equal(ollama?.descriptor.name, 'KnowledgeExtractionOllama');
  const openai = createKnowledgeExtractionFromConfig({ provider: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', model: 'llama-3.1-70b' });
  assert.equal(openai?.descriptor.name, 'KnowledgeExtractionOpenAICompatible');
  // Both satisfy the SAME contract (Transcript -> Concept) — the app is unaware which ran.
  for (const cap of [ollama, openai]) {
    assert.deepEqual([...cap!.descriptor.contract.acceptedObjects], ['Transcript']);
    assert.deepEqual([...cap!.descriptor.contract.producedObjects], ['Concept']);
  }
});

test('a config-selected cloud provider runs end-to-end through the factory', async () => {
  const cap = createKnowledgeExtractionFromConfig(
    { provider: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k', model: 'x' },
    { fetchImpl: fakeOpenAi([{ canonicalName: 'Retrieval Practice', definition: 'Recall strengthens memory.' }]) },
  );
  const out = await cap!.create().invoke({ text: 'lecture' }, ctx);
  assert.deepEqual(out.concepts.map((c) => c.canonicalName), ['Retrieval Practice']);
});

test('extractionConfigFromEnv maps env → config with precedence', () => {
  assert.deepEqual(extractionConfigFromEnv({}), { provider: 'reference' });
  // Legacy OLLAMA_URL keeps working (backward compatible).
  assert.equal(extractionConfigFromEnv({ OLLAMA_URL: 'http://ollama:11434', OLLAMA_MODEL: 'qwen2.5' }).provider, 'ollama');
  // Explicit generic config selects a cloud provider.
  const c = extractionConfigFromEnv({
    KMOS_LLM_PROVIDER: 'openai-compatible', KMOS_LLM_BASE_URL: 'https://api.openai.com/v1',
    KMOS_LLM_MODEL: 'gpt-4o-mini', KMOS_LLM_API_KEY: 'sk', KMOS_LLM_MAX_CONCEPTS: '8',
  });
  assert.equal(c.provider, 'openai-compatible');
  assert.equal(c.baseUrl, 'https://api.openai.com/v1');
  assert.equal(c.model, 'gpt-4o-mini');
  assert.equal(c.maxConcepts, 8);
  // Explicit provider wins over legacy OLLAMA_URL.
  assert.equal(extractionConfigFromEnv({ KMOS_LLM_PROVIDER: 'reference', OLLAMA_URL: 'x' }).provider, 'reference');
});
