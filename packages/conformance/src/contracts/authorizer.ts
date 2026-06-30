/**
 * Authorizer conformance contract (KMOS-0190, CRIT-2). A KMOS Authorizer is the
 * Policy Decision Point consulted at the event chokepoint; it MUST return an
 * explicit allow/deny decision and never throw for a normal decision.
 */
import { createEvent, newCanonicalId, type Authorizer } from '@kmos/canonical-kernel';
import { expect } from '../runner.js';
import type { ConformanceCheck } from '../types.js';

const sample = () => createEvent({ type: 'KnowledgeApproved', schemaVersion: '1.0', producer: 'KnowledgeService', payload: {}, actorId: newCanonicalId('Identity') });

export function authorizerContract(makeAuthorizer: () => Authorizer): ConformanceCheck[] {
  return [
    { id: 'authorizer.returns-decision', description: 'authorize returns an explicit boolean decision', run: () => {
      const d = makeAuthorizer().authorize(sample());
      expect(typeof d.allowed === 'boolean', 'decision.allowed is boolean');
    } },
    { id: 'authorizer.deny-has-reason', description: 'a denial provides a human-readable reason', level: 'Certified', run: () => {
      const d = makeAuthorizer().authorize(sample());
      if (!d.allowed) expect(typeof d.reason === 'string' && d.reason.length > 0, 'denial includes a reason');
    } },
    { id: 'authorizer.total', description: 'authorize is total (does not throw for a normal event)', run: () => {
      makeAuthorizer().authorize(sample());
    } },
  ];
}
