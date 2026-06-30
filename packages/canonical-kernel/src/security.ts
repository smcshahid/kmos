/**
 * Identity, authorization & attribution primitives (KMOS-9999 §15, KMOS-0190,
 * KMOS-0206). Remediation CRIT-2.
 *
 * The CallContext carries the authenticated actor and tenant under whose
 * authority an action is performed. The Authorizer is the policy decision point
 * (PDP) the platform consults before a governed action is allowed to publish a
 * canonical fact. These are kernel-level contracts so enforcement and
 * attribution can be applied uniformly at the event chokepoint (the bus) and,
 * progressively, at service write APIs.
 */

import type { CanonicalId } from './identifiers.js';
import type { CanonicalEvent } from './event-envelope.js';

/** The authenticated actor + tenant under whose authority an action occurs. */
export interface CallContext {
  /** Canonical identity of the actor (human, service, AI worker, connector). */
  readonly actorId: CanonicalId;
  /** Owning organization / tenant, for tenancy scoping (HIGH-2). */
  readonly organizationId?: CanonicalId;
  /** Optional permission grants for simple permission-based authorization. */
  readonly permissions?: readonly string[];
}

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason?: string;
}

/**
 * Policy Decision Point. Returns whether a canonical event may be published.
 * Implementations stay external to business logic (KMOS-0190): the kernel only
 * defines the contract and the enforcement point.
 */
export interface Authorizer {
  authorize(event: CanonicalEvent, context?: CallContext): AuthorizationDecision;
}

/** An authorizer that allows everything (default / non-enforcing deployments). */
export const ALLOW_ALL: Authorizer = {
  authorize: () => ({ allowed: true }),
};
