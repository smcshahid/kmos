/**
 * Ports for the Workflow Service (Constitution §2, KMOS-0204 §1/§4).
 *
 * The Workflow Service coordinates; it NEVER computes. All business work is
 * delegated to Capabilities through the CapabilityInvoker port. The engine NEVER
 * imports the capability runtime or registry — it only depends on this interface
 * (cross-service contact is events + business APIs, Constitution §4).
 */

import type { CanonicalId } from '@kmos/canonical-kernel';

/** Execution context passed to a capability invocation (KMOS-0204 §13). */
export interface InvocationContext {
  readonly workflowId: CanonicalId;
  readonly executionId: CanonicalId;
  readonly stepId: string;
  readonly correlationId: string;
  /** Owning organization / tenant, propagated to the capability invocation. */
  readonly organizationId?: CanonicalId;
}

/**
 * The PORT through which the engine delegates all work. An adapter (or a test
 * fake) resolves the capabilityRef and runs the capability. The engine treats
 * the result as opaque output — it does not interpret business meaning.
 */
export interface CapabilityInvoker {
  invoke(
    capabilityRef: CanonicalId | string,
    input: Record<string, unknown>,
    context: InvocationContext,
  ): Promise<unknown>;
}

/** A handle to an armed timer that a scheduler/test can fire. */
export interface TimerHandle {
  readonly id: CanonicalId;
  cancel(): void;
}

/**
 * Timer PORT (KMOS-0204 §5). The deterministic engine core has no clock; timers
 * are armed through this port and fired by an adapter (or, in tests, manually).
 */
export interface TimerScheduler {
  arm(id: CanonicalId, onExpire: () => void | Promise<void>): TimerHandle;
}
