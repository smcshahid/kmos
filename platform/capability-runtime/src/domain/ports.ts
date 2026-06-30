/**
 * Capability Runtime ports (KMOS-0210 §5; ports-and-adapters).
 *
 * The runtime depends only on these abstractions; concrete adapters live in
 * `infrastructure/`. Swapping an adapter (in-process now; out-of-process / WASM
 * / gRPC later, KMOS-0160 §11) never changes the runtime coordinator or the
 * stable business contract a capability exposes (KMOS-0160 §3, §21).
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { HealthState } from './health.js';

/**
 * Context passed to every capability invocation. Carries correlation/identity
 * metadata so executions remain observable and governable without the handler
 * reaching into platform infrastructure (KMOS-0160 §15).
 */
export interface InvocationContext {
  /** Canonical id of the capability being invoked. */
  readonly capabilityId: CanonicalId;
  /** Resolved semantic version of the active implementation. */
  readonly version: string;
  /** Correlates this execution with a broader business transaction. */
  readonly correlationId?: string;
  /** Identity on whose authority the execution runs. */
  readonly actorId?: CanonicalId;
  /** Tenant/organization scope. */
  readonly organizationId?: CanonicalId;
  /** Workflow execution this invocation belongs to, if any. */
  readonly executionId?: CanonicalId;
  /** Externally-resolved configuration for this capability (KMOS-0160 §9). */
  readonly configuration?: Readonly<Record<string, unknown>>;
}

/**
 * PORT: the executable bound to a capability id + version. This is the stable
 * engineering interface (KMOS-0160 §3, §8): the implementation behind it may be
 * any technology/AI model, and may be replaced, while the contract is preserved.
 */
export interface CapabilityHandler<I = unknown, O = unknown> {
  /** Execute the capability's business work and return its output. */
  invoke(input: I, context: InvocationContext): Promise<O>;
  /** Report the current operational health/readiness (KMOS-0160 §14). */
  health(): HealthState;
}

/** A handler bound to a specific capability id + version. */
export interface ResolvedHandler<I = unknown, O = unknown> {
  readonly capabilityId: CanonicalId;
  readonly version: string;
  readonly handler: CapabilityHandler<I, O>;
}

/**
 * PORT: resolve the ACTIVE handler for a (capabilityId, version?). The runtime
 * never hardcodes implementation locations (KMOS-0160 §13); it asks the resolver
 * which implementation is active. The in-memory adapter registers handlers
 * locally; a registry-backed adapter can query the Capability Registry instead.
 */
export interface CapabilityResolver {
  /** Register/activate a handler for a capability id + version. */
  register(capabilityId: CanonicalId, version: string, handler: CapabilityHandler): void;
  /**
   * Resolve the active handler. When `version` is omitted, the most recently
   * activated implementation for the capability id is returned.
   */
  resolve(capabilityId: CanonicalId, version?: string): ResolvedHandler | undefined;
  /** The active version for a capability id, if any implementation is registered. */
  activeVersion(capabilityId: CanonicalId): string | undefined;
}

/**
 * PORT: externalized configuration (KMOS-0160 §9, KMOS-0210 §3). Capabilities
 * SHALL NOT bake in business configuration; the runtime reads it through this
 * port and passes it into the invocation context. The stub adapter returns an
 * empty configuration; a Configuration-Service-backed adapter can replace it.
 */
export interface ConfigurationPort {
  /** Resolve configuration for a capability id + version (may be empty). */
  resolve(
    capabilityId: CanonicalId,
    version: string,
  ): Readonly<Record<string, unknown>> | undefined;
}
