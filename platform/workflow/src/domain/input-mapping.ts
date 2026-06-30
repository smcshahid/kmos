/**
 * Pure input-mapping resolver (KMOS-0150 §8; coordination, not computation).
 *
 * Resolves a step's declarative input mapping against the execution input and
 * prior step results. This is NOT business logic: it is pure data wiring with
 * NO domain rules, no arithmetic on business values, no branching on meaning.
 * Source forms:
 *   "$input.<path>"        -> a field from the execution input
 *   "$steps.<id>.<path>"   -> a field from a completed step's output
 *   anything else          -> used as a literal value
 */

import type { InputMapping, StepResult } from './model.js';

function readPath(root: unknown, path: readonly string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function resolveInput(
  mapping: InputMapping | undefined,
  executionInput: Record<string, unknown>,
  stepResults: Readonly<Record<string, StepResult>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!mapping) return out;
  for (const [field, source] of Object.entries(mapping)) {
    if (typeof source === 'string' && source.startsWith('$input.')) {
      out[field] = readPath(executionInput, source.slice('$input.'.length).split('.'));
    } else if (typeof source === 'string' && source.startsWith('$steps.')) {
      const [stepId, ...rest] = source.slice('$steps.'.length).split('.');
      const result = stepId ? stepResults[stepId] : undefined;
      out[field] = result ? readPath(result.output, rest) : undefined;
    } else {
      out[field] = source;
    }
  }
  return out;
}
