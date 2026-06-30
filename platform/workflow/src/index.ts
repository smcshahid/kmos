/**
 * @kmos/workflow — Workflow Service (KMOS-0204): the institutional coordination
 * engine. Coordinates Capabilities, Human Tasks, Approvals, Timers, parallel
 * branches, and compensation through declarative workflow definitions (KMOS-0150).
 * It coordinates; it never computes (KMOS-9999 §10): all work is delegated to
 * Capabilities through the CapabilityInvoker port.
 */
export * from './domain/model.js';
export * from './domain/input-mapping.js';
export * from './domain/execution-projection.js';
export * from './domain/event-catalog.js';
export * from './infrastructure/in-memory-repository.js';
export * from './infrastructure/manual-timer-scheduler.js';
export * from './application/ports.js';
export * from './application/workflow-service.js';
