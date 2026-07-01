/**
 * @kmos/providers — real provider adapters behind existing KMOS capability contracts.
 *
 * Applications inject these; they never import a provider SDK or know which provider
 * runs. Extracted from Knowledge Studio (KCSI-01); each adapter cites the app code that
 * justified it in documentation/CAPABILITY-EVOLUTION-ROADMAP.md §3.
 */
export * from './knowledge-extraction/ollama.js';
