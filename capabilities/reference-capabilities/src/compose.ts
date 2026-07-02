/**
 * withFallback — provider fallback / graceful degradation, as a pure capability
 * composition (KCSI-01 WP1).
 *
 * Extracted from the pattern Knowledge Studio hand-rolled TWICE, differently:
 *   - products/knowledge-studio/src/ollama-extraction.ts:93-99  (Ollama -> reference
 *     extractor, incl. "empty result => fall back" without an error), and
 *   - products/knowledge-studio/src/caption.ts:41-43 + studio.ts:218-225 (HTTP failure
 *     -> undefined -> honest degradation).
 * Promotion rationale + citations: documentation/CAPABILITY-EVOLUTION-ROADMAP.md §3.
 *
 * Given a primary and a fallback handler behind the SAME contract, returns a handler
 * that invokes the primary and, on a thrown error OR an "unusable" result (predicate),
 * invokes the fallback. Depends only on the kernel-compatible CapabilityHandler shape —
 * NO runtime import (a capability outlives its runtime, KMOS-0120 §3). Chains compose:
 * `withFallback(a, withFallback(b, c))`.
 */
import type { CapabilityHandler, HealthState, InvocationContext } from './contract.js';

/** Health states in which a handler may be invoked (mirrors the runtime's gate,
 *  inlined so this stays runtime-independent). */
const INVOCABLE: ReadonlySet<HealthState> = new Set<HealthState>(['Ready', 'Busy', 'Degraded']);

export interface WithFallbackOptions<O> {
  /**
   * Is the primary's output good enough to use? Default: defined and non-null.
   * Return `false` to fall back even when the primary did NOT throw — e.g. an LLM
   * returned zero concepts (the Knowledge Studio Ollama case).
   */
  readonly usable?: (output: O) => boolean;
}

/**
 * Compose a primary capability with a fallback behind the same contract. The result
 * is a `CapabilityHandler`: invoke the primary; on error or unusable output, invoke
 * the fallback. Pure w.r.t. its handlers — deterministic given deterministic handlers.
 */
export function withFallback<I, O>(
  primary: CapabilityHandler<I, O>,
  fallback: CapabilityHandler<I, O>,
  options: WithFallbackOptions<O> = {},
): CapabilityHandler<I, O> {
  const usable = options.usable ?? ((o: O): boolean => o !== undefined && o !== null);
  return {
    // Invocable while the primary is; otherwise report the fallback's health, so a
    // degraded/unavailable primary never hides an available fallback.
    health: (): HealthState => (INVOCABLE.has(primary.health()) ? primary.health() : fallback.health()),
    invoke: async (input: I, context: InvocationContext): Promise<O> => {
      try {
        const out = await primary.invoke(input, context);
        if (usable(out)) return out;
      } catch {
        // Graceful degradation: fall through to the fallback.
      }
      return fallback.invoke(input, context);
    },
  };
}
