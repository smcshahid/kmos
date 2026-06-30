/**
 * @kmos/observability — zero-dependency observability toolkit (metrics,
 * structured logging, health) that every KMOS service uses to expose
 * health/metrics/logs (KMOS-0200 §13, KMOS-9999 §18).
 *
 * Deterministic by construction: clocks and sinks are injected, so the toolkit
 * adds no hidden non-determinism to deterministic cores (constitution §6).
 */
export * from './metrics.js';
export * from './logging.js';
export * from './health.js';
