/**
 * Local runtime event-catalog extension (KMOS-0210 §4).
 *
 * The kernel's seed catalog (KMOS-10040 §23) does not yet contain the runtime's
 * execution-lifecycle events. Per the Coding Constitution, a service may not
 * invent a private event vocabulary by bypassing the catalog; instead it
 * extends a LOCAL catalog (seeded with the kernel defaults) and publishes
 * through a bus bound to that catalog. These events are promoted into the kernel
 * seed once governance ratifies KMOS-0210.
 */

import { EventCatalog } from '@kmos/canonical-kernel';

/** Event types owned by the Capability Runtime, pending promotion to the kernel seed. */
export const RUNTIME_EVENT_TYPES = [
  'CapabilityRuntimeRegistered',
  'CapabilityExecutionStarted',
  'CapabilityExecutionCompleted',
  'CapabilityExecutionFailed',
] as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

/**
 * Build a catalog that includes every kernel default PLUS the runtime's own
 * execution-lifecycle event types. The runtime's default bus is bound to this
 * catalog so that its events validate while still rejecting unregistered types.
 */
export function createRuntimeCatalog(): EventCatalog {
  // Kernel is the authoritative catalog (MED-5); runtime event types now live
  // in the kernel seed. Idempotent registration kept for API compatibility.
  const catalog = new EventCatalog();
  const defs = [
    { type: 'CapabilityRuntimeRegistered', owner: 'Capability', eventClass: 'Platform', schemaVersion: '1.0', category: 'Capability' },
    { type: 'CapabilityExecutionStarted', owner: 'Capability', eventClass: 'Operational', schemaVersion: '1.0', category: 'Capability' },
    { type: 'CapabilityExecutionCompleted', owner: 'Capability', eventClass: 'Capability', schemaVersion: '1.0', category: 'Capability' },
    { type: 'CapabilityExecutionFailed', owner: 'Capability', eventClass: 'Operational', schemaVersion: '1.0', category: 'Capability' },
  ] as const;
  for (const def of defs) if (!catalog.has(def.type)) catalog.register(def);
  return catalog;
}
