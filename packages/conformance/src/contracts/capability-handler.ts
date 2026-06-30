/**
 * Capability handler conformance contract (KMOS-0120/0160/0210). A KMOS
 * capability handler exposes `invoke` + `health`; it must report a valid health
 * state and produce output for valid input.
 */
import { expect } from '../runner.js';
import type { ConformanceCheck } from '../types.js';

const HEALTH = ['Unknown', 'Starting', 'Ready', 'Busy', 'Degraded', 'Unavailable'];

export interface CapabilityHandlerLike {
  invoke(input: unknown, context: unknown): unknown;
  health(): string;
}

export function capabilityHandlerContract(makeHandler: () => CapabilityHandlerLike, sampleInput: unknown = {}): ConformanceCheck[] {
  return [
    { id: 'capability.health.valid', description: 'health() returns a canonical health state', run: () => {
      expect(HEALTH.includes(makeHandler().health()), 'health is a canonical state');
    } },
    { id: 'capability.invoke.returns', description: 'invoke() returns output for valid input', run: async () => {
      const out = await makeHandler().invoke(sampleInput, {});
      expect(out !== undefined && out !== null, 'invoke produced output');
    } },
    { id: 'capability.invoke.pure-shape', description: 'invoke() is contract-bound (no thrown business control-flow for valid input)', level: 'Certified', run: async () => {
      await makeHandler().invoke(sampleInput, {});
    } },
  ];
}
