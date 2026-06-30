/**
 * Canonical lifecycle (KMOS-0100 §7, KMOS-10030 §16).
 *
 * Every canonical object follows a visible lifecycle. Domains MAY define
 * additional internal states, but the canonical lifecycle below remains visible
 * to the platform, and every transition is intended to produce a canonical
 * event (enforced by the owning service, not the kernel).
 */

export const LIFECYCLE_STATES = [
  'Created',
  'Validated',
  'Active',
  'Updated',
  'Reviewed',
  'Approved',
  'Published',
  'Archived',
  'Preserved',
  'Retired',
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Allowed forward transitions in the canonical lifecycle. This is intentionally
 * permissive (a directed graph, not a strict linear chain) because different
 * canonical objects legitimately skip states (e.g. an Asset may go
 * Approved -> Published; Knowledge may go Reviewed -> Approved). Services may
 * further constrain transitions for the objects they own.
 */
const ALLOWED: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  Created: ['Validated', 'Active', 'Updated', 'Reviewed', 'Archived', 'Retired'],
  Validated: ['Active', 'Reviewed', 'Approved', 'Archived', 'Retired'],
  Active: ['Updated', 'Reviewed', 'Approved', 'Published', 'Archived', 'Retired'],
  Updated: ['Reviewed', 'Approved', 'Published', 'Active', 'Archived', 'Retired'],
  Reviewed: ['Approved', 'Updated', 'Archived', 'Retired'],
  Approved: ['Published', 'Updated', 'Archived', 'Preserved', 'Retired'],
  Published: ['Updated', 'Archived', 'Preserved', 'Retired'],
  Archived: ['Preserved', 'Retired', 'Active'],
  Preserved: ['Retired', 'Active'],
  Retired: [],
};

export function isLifecycleState(value: string): value is LifecycleState {
  return (LIFECYCLE_STATES as readonly string[]).includes(value);
}

/** True if a transition from `from` to `to` is permitted by the canonical lifecycle. */
export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return ALLOWED[from].includes(to);
}
