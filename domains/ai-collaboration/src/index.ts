/**
 * @kmos/ai-collaboration — AI Collaboration domain service (KMOS-0008).
 *
 * AI is a collaborator, never the system of record; humans govern. This domain
 * registers AI workers as canonical (never-anonymous) identities + capabilities,
 * invokes them via the Capability Runtime, records every output as a
 * non-authoritative AiContribution (a recommendation), and routes human review
 * through the Governance Service so only human-approved contributions become
 * authoritative.
 */
export * from './ai-contribution.js';
export * from './infrastructure/ai-worker-handler.js';
export * from './ai-collaboration-service.js';
