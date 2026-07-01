/**
 * Ollama-backed concept-extraction capability (provider-independent, behind the KMOS
 * capability contract).
 *
 * Richer concepts than the deterministic reference extractor: an LLM reads the corrected
 * transcript and returns named concepts + one-sentence definitions grounded in the text.
 * It conforms to the SAME `KnowledgeExtraction` contract, so the Language domain composes
 * it exactly like the reference one (KMOS-9999 §9) — the app just injects it. On ANY error
 * (Ollama down, timeout, malformed output) it falls back to the reference extractor, so
 * processing always yields useful concepts. Provider independence is preserved: the HTTP
 * shape here is Ollama's, but the seam is the capability, swappable for any LLM adapter.
 */

import type {
  CapabilityDescriptor, CapabilityHandler, ExtractionInput, ExtractionOutput, ReferenceCapability,
} from '@kmos/reference-capabilities';
import { knowledgeExtraction } from '@kmos/reference-capabilities';

export interface OllamaExtractionOptions {
  /** Ollama base URL, e.g. http://ollama:11434 */
  readonly url: string;
  /** Model name, e.g. 'llama3.1' or 'qwen2.5'. */
  readonly model?: string;
  readonly maxConcepts?: number;
  readonly timeoutMs?: number;
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
}

const descriptor: CapabilityDescriptor = {
  name: 'KnowledgeExtractionOllama',
  ownerDomain: 'Knowledge',
  businessPurpose: 'Extract concepts + definitions from text via a provider-independent LLM',
  version: '1.0.0',
  inputs: ['Transcript'],
  outputs: ['Concept'],
  contract: {
    acceptedObjects: ['Transcript'], producedObjects: ['Concept'],
    consumedEvents: ['TranscriptCorrected'], publishedEvents: ['KnowledgeExtracted'],
  },
};

const SYSTEM_PROMPT =
  'You extract the key concepts a learner should understand from a lecture transcript. '
  + 'Return STRICT JSON of the form {"concepts":[{"canonicalName":"...","definition":"..."}]}. '
  + 'canonicalName is 1-4 words (a real term from the text). definition is one sentence, '
  + 'grounded in the transcript, no more than 25 words. Do not invent facts not in the text.';

export function createOllamaExtraction(opts: OllamaExtractionOptions): ReferenceCapability<ExtractionInput, ExtractionOutput> {
  const model = opts.model ?? 'llama3.1';
  const maxConcepts = opts.maxConcepts ?? 12;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.url.replace(/\/$/, '');
  const fallback = knowledgeExtraction.create();

  async function viaOllama(text: string): Promise<ExtractionOutput['concepts']> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model, stream: false, format: 'json', options: { temperature: 0.1 },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text.slice(0, 24_000) },
          ],
        }),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { message?: { content?: string } };
      const content = body.message?.content ?? '';
      const parsed = JSON.parse(content) as { concepts?: Array<{ canonicalName?: unknown; definition?: unknown }> };
      const concepts = (parsed.concepts ?? [])
        .map((c) => ({ canonicalName: String(c.canonicalName ?? '').trim(), definition: String(c.definition ?? '').trim() }))
        .filter((c) => c.canonicalName.length > 0)
        .slice(0, maxConcepts);
      return concepts;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    descriptor,
    create(): CapabilityHandler<ExtractionInput, ExtractionOutput> {
      return {
        health: () => 'Ready',
        invoke: async (input, context) => {
          try {
            const concepts = await viaOllama(input.text);
            if (concepts.length > 0) return { concepts };
          } catch {
            // fall through to the deterministic reference extractor
          }
          return fallback.invoke(input, context);
        },
      };
    },
  };
}
