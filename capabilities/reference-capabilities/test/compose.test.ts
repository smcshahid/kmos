import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CapabilityHandler, HealthState } from '../src/index.js';
import { withFallback } from '../src/index.js';

const ctx = {};

/** Small handler builder for tests. */
function handler<I, O>(
  fn: (input: I) => O | Promise<O>,
  health: HealthState = 'Ready',
): CapabilityHandler<I, O> {
  return { health: () => health, invoke: async (input) => fn(input) };
}

test('withFallback returns the primary output when it is usable', async () => {
  let fallbackCalls = 0;
  const primary = handler<{ n: number }, number>((i) => i.n * 2);
  const fallback = handler<{ n: number }, number>(() => { fallbackCalls += 1; return -1; });
  const composed = withFallback(primary, fallback);
  assert.equal(await composed.invoke({ n: 21 }, ctx), 42);
  assert.equal(fallbackCalls, 0, 'fallback must not run when the primary succeeds');
});

test('withFallback falls back when the primary throws (graceful degradation)', async () => {
  const primary = handler<string, string>(() => { throw new Error('provider down'); });
  const fallback = handler<string, string>((s) => `reference:${s}`);
  const composed = withFallback(primary, fallback);
  assert.equal(await composed.invoke('x', ctx), 'reference:x');
});

test('withFallback falls back on an UNUSABLE result even without an error (Ollama empty-concepts case)', async () => {
  // Mirrors ollama-extraction.ts:93-99 — empty concepts => use the reference extractor.
  type Out = { concepts: string[] };
  const primary = handler<string, Out>(() => ({ concepts: [] }));
  const fallback = handler<string, Out>(() => ({ concepts: ['Sincerity'] }));
  const composed = withFallback(primary, fallback, { usable: (o) => o.concepts.length > 0 });
  assert.deepEqual(await composed.invoke('t', ctx), { concepts: ['Sincerity'] });
});

test('withFallback treats null/undefined primary output as unusable by default', async () => {
  const primary = handler<string, string | undefined>(() => undefined);
  const fallback = handler<string, string | undefined>(() => 'fallback');
  const composed = withFallback(primary, fallback);
  assert.equal(await composed.invoke('x', ctx), 'fallback');
});

test('withFallback passes the invocation context through to whichever handler runs', async () => {
  const seen: string[] = [];
  const primary: CapabilityHandler<number, number> = {
    health: () => 'Ready',
    invoke: async (_i, c) => { seen.push(`primary:${c.correlationId ?? ''}`); return 1; },
  };
  const fallback = handler<number, number>(() => 0);
  await withFallback(primary, fallback).invoke(5, { correlationId: 'abc' });
  assert.deepEqual(seen, ['primary:abc']);
});

test('withFallback health: reports primary health while invocable, else the fallback health', async () => {
  const ready = handler<number, number>((n) => n, 'Ready');
  const down = handler<number, number>((n) => n, 'Unavailable');
  assert.equal(withFallback(ready, down).health(), 'Ready');
  // A down primary must not hide an available fallback.
  assert.equal(withFallback(down, ready).health(), 'Ready');
  assert.equal(withFallback(down, down).health(), 'Unavailable');
});

test('withFallback chains compose: withFallback(a, withFallback(b, c))', async () => {
  const a = handler<string, string>(() => { throw new Error('a down'); });
  const b = handler<string, string>(() => { throw new Error('b down'); });
  const c = handler<string, string>((s) => `c:${s}`);
  const composed = withFallback(a, withFallback(b, c));
  assert.equal(await composed.invoke('x', ctx), 'c:x');
});
