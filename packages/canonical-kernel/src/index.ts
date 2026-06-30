/**
 * @kmos/canonical-kernel — the single source of truth for KMOS canonical
 * objects, the event envelope, schemas, the in-process event bus, and replay.
 *
 * Derived strictly from KMOS-0100, 0110, 0130, 0140 and catalogs 10030/10040.
 * No platform service, capability, workflow, or application may redefine these
 * canonical types (KMOS-9999 §7; Readiness Report risk R-02).
 */

export * from './identifiers.js';
export * from './lifecycle.js';
export * from './errors.js';
export * from './canonical-object.js';
export * from './event-envelope.js';
export * from './security.js';

export * from './schema/validate.js';
export * from './schema/envelope-schema.js';
export * from './schema/event-catalog.js';
export * from './schema/object-schemas.js';

export * from './event-bus/append-log.js';
export * from './event-bus/bus.js';
export * from './event-bus/replay.js';
