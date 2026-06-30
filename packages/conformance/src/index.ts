/**
 * @kmos/conformance — the KMOS Conformance Kit.
 *
 * Defines what it means to be KMOS-compliant (profiles, levels, contracts) and
 * provides a framework-agnostic runner + report. Depends only on the canonical
 * kernel, so any implementation, adapter, capability, service, SDK, or future
 * application can self-certify with `runConformance(...)` and ship the report as
 * evidence. This is a strategic platform capability: it protects architectural
 * integrity as KMOS evolves across products and teams.
 */
export * from './types.js';
export * from './runner.js';
export * from './contracts/event-log.js';
export * from './contracts/authorizer.js';
export * from './contracts/capability-handler.js';
export * from './contracts/canonical-object.js';

/** The published catalogue of conformance profiles in this kit version. */
export const CONFORMANCE_PROFILES = [
  { id: 'eventlog', title: 'Storage / EventLog adapter', spec: 'KMOS-0203' },
  { id: 'authorizer', title: 'Authorization PDP', spec: 'KMOS-0190' },
  { id: 'capability-handler', title: 'Capability handler', spec: 'KMOS-0120/0160/0210' },
  { id: 'canonical-object', title: 'Canonical object', spec: 'KMOS-0100/0130/10030' },
  { id: 'canonical-event', title: 'Canonical event', spec: 'KMOS-0110/10040' },
] as const;
