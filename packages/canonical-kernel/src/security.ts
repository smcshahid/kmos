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

import { AsyncLocalStorage } from 'node:async_hooks';
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

/* ------------------------------------------------------------------ */
/* Ambient CallContext (CRIT-2 pervasive attribution).                */
/* ------------------------------------------------------------------ */

/**
 * Request/operation-scoped CallContext propagation (KMOS-9999 §15, KMOS-0206).
 *
 * Attribution is a cross-cutting security concern, so the acting actor + tenant
 * are carried in an `AsyncLocalStorage` that propagates across `await`s, rather
 * than threaded as a parameter through every service write method. The bus reads
 * this at the single chokepoint and STAMPS `actorId`/`organizationId` onto every
 * persisted event (see {@link attributeFromContext}). The audit trail therefore
 * stays explicit (every fact carries its actor) while the plumbing stays out of
 * business signatures. `node:async_hooks` is a Node builtin — no npm dependency
 * is added (D-F preserved).
 */
const contextStore = new AsyncLocalStorage<CallContext>();

/** Run `fn` with `context` as the ambient CallContext (propagates across awaits). */
export function runWithContext<T>(context: CallContext, fn: () => T): T {
  return contextStore.run(context, fn);
}

/** The ambient CallContext for the current async execution, if any. */
export function currentContext(): CallContext | undefined {
  return contextStore.getStore();
}

/**
 * Return an event attributed to the ambient CallContext. If a context is active
 * and the event lacks `actorId`/`organizationId`, stamp them onto a copy.
 * EXPLICIT values already on the event always win (correct precedence: a service
 * that knows the true subject tenant overrides the ambient one). No context →
 * the event is returned unchanged, so non-enforcing deployments are unaffected.
 */
export function attributeFromContext(event: CanonicalEvent): CanonicalEvent {
  const ctx = contextStore.getStore();
  if (ctx === undefined) return event;
  const id = event.identity;
  const needsActor = id.actorId === undefined && ctx.actorId !== undefined;
  const needsOrg = id.organizationId === undefined && ctx.organizationId !== undefined;
  if (!needsActor && !needsOrg) return event;
  return {
    ...event,
    identity: {
      ...id,
      ...(needsActor ? { actorId: ctx.actorId } : {}),
      ...(needsOrg ? { organizationId: ctx.organizationId } : {}),
    },
  };
}
