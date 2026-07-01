/**
 * @kmos/configuration — Configuration Service (KMOS-0209): externalized,
 * versioned, governed configuration with secret references.
 */
export * from './domain/model.js';
export * from './domain/secret-resolver.js';
export * from './domain/configuration-catalog.js';
export * from './infrastructure/in-memory-repository.js';
export * from './infrastructure/echo-secret-resolver.js';
export * from './infrastructure/env-secret-resolver.js';
export * from './application/configuration-service.js';
