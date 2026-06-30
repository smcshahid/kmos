/**
 * Capability health model (KMOS-0160 §14, KMOS-0210 §3).
 *
 * Every capability handler exposes a coarse health/readiness state. Health
 * distinguishes operational availability from business correctness: a Ready
 * handler may still reject a particular input as a business Validation failure,
 * while an Unavailable handler reflects an operational fault. The runtime never
 * interprets these states beyond surfacing them; orchestrators (Workflow
 * Service) decide what to do with them.
 */

/** Coarse health/readiness states (KMOS-0160 §14). */
export const HEALTH_STATES = [
  'Unknown',
  'Starting',
  'Ready',
  'Busy',
  'Degraded',
  'Unavailable',
] as const;

export type HealthState = (typeof HEALTH_STATES)[number];

/** The set of states in which a handler may accept an invocation. */
const INVOCABLE: ReadonlySet<HealthState> = new Set<HealthState>([
  'Ready',
  'Busy',
  'Degraded',
]);

/** Whether a handler in the given health state may be invoked at all. */
export function isInvocable(state: HealthState): boolean {
  return INVOCABLE.has(state);
}
