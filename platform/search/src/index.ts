/**
 * @kmos/search — Search & Discovery Service (KMOS-0208).
 *
 * Governance-aware discovery of canonical objects via event-driven projections.
 * Search indexes are PROJECTIONS, never the system of record (KMOS-0130 §18):
 * they are built from canonical events and fully rebuildable from the log.
 */
export * from './domain/model.js';
export * from './domain/ports.js';
export * from './domain/ranking.js';
export * from './domain/catalog.js';
export * from './infrastructure/in-memory-index-store.js';
export * from './infrastructure/hashing-embedder.js';
export * from './infrastructure/allow-all-access-filter.js';
export * from './application/projection.js';
export * from './application/search-service.js';
