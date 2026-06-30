/**
 * @kmos/capability-runtime — Capability Runtime (KMOS-0210).
 *
 * Executes registered capabilities behind their stable business contracts,
 * isolated, observable, configurable, and technology-independent (KMOS-0160).
 */
export * from './domain/health.js';
export * from './domain/ports.js';
export * from './domain/runtime-catalog.js';
export * from './infrastructure/in-memory-resolver.js';
export * from './infrastructure/static-configuration.js';
export * from './application/capability-runtime-service.js';
