/**
 * Shared LLM knowledge-extraction core (ESRI-01).
 *
 * The provider-agnostic parts every LLM knowledge-extraction adapter shares: the system
 * prompt and the strict-JSON concept parser. Adapters differ only in HTTP shape (Ollama
 * `/api/chat` vs the OpenAI-compatible `/chat/completions`), so this keeps them DRY and
 * their behavior identical where it should be.
 */

import type { ExtractionOutput } from '@kmos/reference-capabilities';

/** The instruction shared by all LLM extraction adapters. */
export const CONCEPT_SYSTEM_PROMPT =
  'You extract the key concepts a learner should understand from a lecture transcript. '
  + 'Return STRICT JSON of the form {"concepts":[{"canonicalName":"...","definition":"..."}]}. '
  + 'canonicalName is 1-4 words (a real term from the text). definition is one sentence, '
  + 'grounded in the transcript, no more than 25 words. Do not invent facts not in the text.';

/** Parse a model's strict-JSON content into concepts (bounded, trimmed, non-empty). */
export function parseConcepts(content: string, maxConcepts: number): ExtractionOutput['concepts'] {
  const parsed = JSON.parse(content) as { concepts?: Array<{ canonicalName?: unknown; definition?: unknown }> };
  return (parsed.concepts ?? [])
    .map((c) => ({ canonicalName: String(c.canonicalName ?? '').trim(), definition: String(c.definition ?? '').trim() }))
    .filter((c) => c.canonicalName.length > 0)
    .slice(0, maxConcepts);
}

/** Cap transcript length sent to a model (token/cost safety). */
export function boundText(text: string): string {
  return text.slice(0, 24_000);
}
