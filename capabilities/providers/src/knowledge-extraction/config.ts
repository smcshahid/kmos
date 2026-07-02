/**
 * Knowledge-extraction provider configuration (ESRI-01).
 *
 * A small config model + factory — NOT a registry or orchestration framework (Ecosystem
 * Constitution Art. IV/V). It selects a provider adapter from configuration and composes
 * fallback to the deterministic reference, so an application switches AI providers
 * (local Ollama ↔ any OpenAI-compatible cloud) by **changing configuration, never code**.
 *
 * Applications call `extractionConfigFromEnv()` then `createKnowledgeExtractionFromConfig()`
 * and inject the result — they never name a provider.
 */

import type { ExtractionInput, ExtractionOutput, ReferenceCapability } from '@kmos/reference-capabilities';
import { createOllamaExtraction } from './ollama.js';
import { createOpenAiCompatibleExtraction } from './openai-compatible.js';

/** Which knowledge-extraction provider to use. `reference` = deterministic offline. */
export type KnowledgeExtractionProvider = 'reference' | 'ollama' | 'openai-compatible';

export interface KnowledgeExtractionConfig {
  readonly provider: KnowledgeExtractionProvider;
  /** Endpoint base URL (Ollama root, or the OpenAI-compatible base incl. version path). */
  readonly baseUrl?: string;
  /** Model / deployment name. */
  readonly model?: string;
  /** API key (secret; resolved from a secret reference / env — never hardcoded). */
  readonly apiKey?: string;
  readonly maxConcepts?: number;
  readonly timeoutMs?: number;
  /** Extra headers for the OpenAI-compatible adapter (e.g. Azure). */
  readonly headers?: Readonly<Record<string, string>>;
}

export interface ConfigDeps {
  /** Injectable fetch for tests. */
  readonly fetchImpl?: typeof fetch;
}

/**
 * Build a knowledge-extraction capability from configuration. Returns `undefined` for the
 * `reference` provider (the language domain then uses its built-in reference extractor),
 * so "no provider configured" and "reference provider" behave identically. Any real
 * provider is composed with fallback to the reference inside its adapter.
 */
export function createKnowledgeExtractionFromConfig(
  cfg: KnowledgeExtractionConfig,
  deps: ConfigDeps = {},
): ReferenceCapability<ExtractionInput, ExtractionOutput> | undefined {
  switch (cfg.provider) {
    case 'ollama':
      if (!cfg.baseUrl) return undefined;
      return createOllamaExtraction({
        url: cfg.baseUrl,
        ...(cfg.model ? { model: cfg.model } : {}),
        ...(cfg.maxConcepts !== undefined ? { maxConcepts: cfg.maxConcepts } : {}),
        ...(cfg.timeoutMs !== undefined ? { timeoutMs: cfg.timeoutMs } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
    case 'openai-compatible':
      if (!cfg.baseUrl) return undefined;
      return createOpenAiCompatibleExtraction({
        baseUrl: cfg.baseUrl,
        ...(cfg.apiKey ? { apiKey: cfg.apiKey } : {}),
        ...(cfg.model ? { model: cfg.model } : {}),
        ...(cfg.maxConcepts !== undefined ? { maxConcepts: cfg.maxConcepts } : {}),
        ...(cfg.timeoutMs !== undefined ? { timeoutMs: cfg.timeoutMs } : {}),
        ...(cfg.headers ? { headers: cfg.headers } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
    case 'reference':
    default:
      return undefined;
  }
}

/**
 * Map environment variables → configuration. Precedence:
 *   1. Explicit `KMOS_LLM_PROVIDER` (+ `KMOS_LLM_BASE_URL` / `_MODEL` / `_API_KEY` / …).
 *   2. Legacy `OLLAMA_URL` (+ `OLLAMA_MODEL`) → the `ollama` provider (backward compatible).
 *   3. Otherwise the deterministic `reference` provider.
 */
export function extractionConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): KnowledgeExtractionConfig {
  const num = (v: string | undefined): number | undefined => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const common = {
    ...(env.KMOS_LLM_MODEL ? { model: env.KMOS_LLM_MODEL } : {}),
    ...(env.KMOS_LLM_API_KEY ? { apiKey: env.KMOS_LLM_API_KEY } : {}),
    ...(num(env.KMOS_LLM_MAX_CONCEPTS) !== undefined ? { maxConcepts: num(env.KMOS_LLM_MAX_CONCEPTS) } : {}),
    ...(num(env.KMOS_LLM_TIMEOUT_MS) !== undefined ? { timeoutMs: num(env.KMOS_LLM_TIMEOUT_MS) } : {}),
  };

  const explicit = env.KMOS_LLM_PROVIDER as KnowledgeExtractionProvider | undefined;
  if (explicit === 'ollama' || explicit === 'openai-compatible') {
    return { provider: explicit, ...(env.KMOS_LLM_BASE_URL ? { baseUrl: env.KMOS_LLM_BASE_URL } : {}), ...common };
  }
  if (explicit === 'reference') return { provider: 'reference' };

  // Backward compatibility: OLLAMA_URL keeps working with no config change.
  if (env.OLLAMA_URL) {
    return {
      provider: 'ollama', baseUrl: env.OLLAMA_URL,
      ...(env.OLLAMA_MODEL ? { model: env.OLLAMA_MODEL } : common),
    };
  }
  return { provider: 'reference' };
}
