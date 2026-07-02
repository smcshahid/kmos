/**
 * @kmos/sdk — the KMOS application SDK.
 *
 * Compose the platform substrate once; build your application (domains + a thin UI/API)
 * on top. The SDK stops at the platform layer by design: domain composition belongs to
 * the deployable (KMOS-0200 §17). Extracted from Knowledge Studio under KCSI-01; see
 * documentation/CAPABILITY-EVOLUTION-ROADMAP.md §3.
 */
export * from './platform-runtime.js';
