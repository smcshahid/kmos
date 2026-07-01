/**
 * Ollama-backed knowledge-extraction provider (KCSI-01 WP2).
 *
 * A real provider adapter behind the EXISTING `KnowledgeExtraction` contract: an LLM
 * reads the corrected transcript and returns named concepts + one-sentence definitions
 * grounded in the text. Composed with the deterministic reference extractor via the
 * `withFallback` primitive (KCSI-01 WP1), so on ANY failure — Ollama down, timeout,
 * malformed output, or zero concepts — processing still yields useful concepts.
 *
 * Relocated verbatim-in-behavior from products/knowledge-studio/src/ollama-extraction.ts
 * so the application no longer carries provider HTTP logic. Provider independence is
 * preserved: the HTTP shape here is Ollama's, but the seam is the capability contract —
 * swappable for any LLM adapter. See documentation/CAPABILITY-EVOLUTION-ROADMAP.md §3.
 */

import type {
  CapabilityDescriptor, CapabilityHandler, ExtractionInput, ExtractionOutput, ReferenceCapability,
} from '@kmos/reference-capabilities';
import { knowledgeExtraction, withFallback } from '@kmos/reference-capabilities';
import { CONCEPT_SYSTEM_PROMPT, parseConcepts, boundText } from './llm-core.js';

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

/**
 * Build the Ollama knowledge-extraction capability. The returned `create()` composes
 * an Ollama handler with the reference extractor via `withFallback`: an unusable
 * result (zero concepts) or any thrown error yields the deterministic reference output.
 */
export function createOllamaExtraction(
  opts: OllamaExtractionOptions,
): ReferenceCapability<ExtractionInput, ExtractionOutput> {
  const model = opts.model ?? 'llama3.1';
  const maxConcepts = opts.maxConcepts ?? 12;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const doFetch = opts.fetchImpl ?? fetch;
  const base = opts.url.replace(/\/$/, '');

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
            { role: 'system', content: CONCEPT_SYSTEM_PROMPT },
            { role: 'user', content: boundText(text) },
          ],
        }),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as { message?: { content?: string } };
      return parseConcepts(body.message?.content ?? '', maxConcepts);
    } finally {
      clearTimeout(timer);
    }
  }

  const ollamaHandler: CapabilityHandler<ExtractionInput, ExtractionOutput> = {
    health: () => 'Ready',
    invoke: async (input) => ({ concepts: await viaOllama(input.text) }),
  };

  return {
    descriptor,
    // Provider fallback / graceful degradation, now a shared primitive (WP1): empty
    // concepts or any error → the deterministic reference extractor.
    create: (): CapabilityHandler<ExtractionInput, ExtractionOutput> =>
      withFallback(ollamaHandler, knowledgeExtraction.create(), { usable: (o) => o.concepts.length > 0 }),
  };
}
