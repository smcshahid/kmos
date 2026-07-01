/**
 * OpenAI-compatible knowledge-extraction provider (ESRI-01).
 *
 * A single adapter for the many providers that speak the standard `/chat/completions`
 * API: **OpenAI, Azure OpenAI, Groq, DeepSeek, OpenRouter, Mistral, Together**, and any
 * OpenAI-compatible endpoint — selected purely by `baseUrl` + `model` + `apiKey`. It
 * satisfies the SAME `KnowledgeExtraction` contract as the Ollama adapter and the
 * deterministic reference, so adding it required **no application change** — the proof
 * that switching providers is configuration, not code.
 *
 * Composed with the reference extractor via `withFallback`: any error / empty output
 * degrades to the deterministic reference, so processing never breaks.
 */

import type {
  CapabilityDescriptor, CapabilityHandler, ExtractionInput, ExtractionOutput, ReferenceCapability,
} from '@kmos/reference-capabilities';
import { knowledgeExtraction, withFallback } from '@kmos/reference-capabilities';
import { CONCEPT_SYSTEM_PROMPT, parseConcepts, boundText } from './llm-core.js';

export interface OpenAiCompatibleExtractionOptions {
  /** Base URL including any version path, e.g. https://api.openai.com/v1,
   *  https://api.groq.com/openai/v1, https://openrouter.ai/api/v1, or an Azure/self-host URL. */
  readonly baseUrl: string;
  /** API key (a secret; injected from a secret reference / env — never hardcoded). */
  readonly apiKey?: string;
  /** Model / deployment name, e.g. 'gpt-4o-mini', 'llama-3.1-70b', 'deepseek-chat'. */
  readonly model?: string;
  readonly maxConcepts?: number;
  readonly timeoutMs?: number;
  /** Extra headers (e.g. Azure `api-key`, OpenRouter attribution). */
  readonly headers?: Readonly<Record<string, string>>;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
}

const descriptor: CapabilityDescriptor = {
  name: 'KnowledgeExtractionOpenAICompatible',
  ownerDomain: 'Knowledge',
  businessPurpose: 'Extract concepts + definitions from text via any OpenAI-compatible LLM',
  version: '1.0.0',
  inputs: ['Transcript'],
  outputs: ['Concept'],
  contract: {
    acceptedObjects: ['Transcript'], producedObjects: ['Concept'],
    consumedEvents: ['TranscriptCorrected'], publishedEvents: ['KnowledgeExtracted'],
  },
};

/**
 * Build an OpenAI-compatible knowledge-extraction capability. The returned `create()`
 * composes the provider handler with the reference extractor via `withFallback`.
 */
export function createOpenAiCompatibleExtraction(
  opts: OpenAiCompatibleExtractionOptions,
): ReferenceCapability<ExtractionInput, ExtractionOutput> {
  const model = opts.model ?? 'gpt-4o-mini';
  const maxConcepts = opts.maxConcepts ?? 12;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.baseUrl.replace(/\/$/, '');

  async function viaProvider(text: string): Promise<ExtractionOutput['concepts']> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
          ...(opts.headers ?? {}),
        },
        signal: controller.signal,
        body: JSON.stringify({
          model, temperature: 0.1, response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: CONCEPT_SYSTEM_PROMPT },
            { role: 'user', content: boundText(text) },
          ],
        }),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return parseConcepts(body.choices?.[0]?.message?.content ?? '', maxConcepts);
    } finally {
      clearTimeout(timer);
    }
  }

  const handler: CapabilityHandler<ExtractionInput, ExtractionOutput> = {
    health: () => 'Ready',
    invoke: async (input) => ({ concepts: await viaProvider(input.text) }),
  };

  return {
    descriptor,
    create: (): CapabilityHandler<ExtractionInput, ExtractionOutput> =>
      withFallback(handler, knowledgeExtraction.create(), { usable: (o) => o.concepts.length > 0 }),
  };
}
