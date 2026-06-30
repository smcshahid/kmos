/**
 * Capability contract surface (structural; KMOS-0120, KMOS-0160).
 *
 * Capabilities depend ONLY on the kernel. A capability exposes a handler with
 * `invoke` + `health` (structurally compatible with the Capability Runtime's
 * CapabilityHandler port — no import needed) plus a descriptor used to register
 * it in the Capability Registry. This keeps capabilities free of any runtime
 * dependency (a capability outlives its implementation/runtime, KMOS-0120 §3).
 */

export type HealthState =
  | 'Unknown' | 'Starting' | 'Ready' | 'Busy' | 'Degraded' | 'Unavailable';

export interface InvocationContext {
  readonly capabilityId?: string;
  readonly version?: string;
  readonly correlationId?: string;
  readonly organizationId?: string;
  readonly configuration?: Readonly<Record<string, unknown>>;
}

export interface CapabilityHandler<I = unknown, O = unknown> {
  invoke(input: I, context: InvocationContext): Promise<O>;
  health(): HealthState;
}

/** Registration descriptor for the Capability Registry (KMOS-0120 §6). */
export interface CapabilityDescriptor {
  readonly name: string;
  readonly ownerDomain: string;
  readonly businessPurpose: string;
  readonly version: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly contract: {
    readonly acceptedObjects: readonly string[];
    readonly producedObjects: readonly string[];
    readonly consumedEvents: readonly string[];
    readonly publishedEvents: readonly string[];
  };
}

export interface ReferenceCapability<I = unknown, O = unknown> {
  readonly descriptor: CapabilityDescriptor;
  create(): CapabilityHandler<I, O>;
}
