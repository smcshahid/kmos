/**
 * CRIT-2 pervasive attribution (KMOS-9999 §15, KMOS-0206).
 *
 * Proves enforcement is not just a mechanism on the raw bus, but works
 * end-to-end across REAL services without threading a context parameter through
 * every write method: a `runWithContext` scope stamps the acting actor + tenant
 * onto EVERY canonical fact the services publish, via the bus chokepoint
 * (`attributeFromContext`). Outside a context, an enforcing bus rejects
 * unattributed writes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, runWithContext, currentContext, newCanonicalId } from '@kmos/canonical-kernel';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { KnowledgeService } from '@kmos/knowledge';
import { GovernanceService } from '@kmos/governance';

const now = (): string => '2026-06-30T00:00:00.000Z';
const ACTOR = newCanonicalId('Identity');
const ORG = newCanonicalId('Organization');

/** A platform whose bus runs in ENFORCING mode (every fact must be attributed). */
function enforcingPlatform() {
  const bus = new EventBus({ catalog: createPlatformCatalog(), requireActor: true });
  return {
    bus,
    knowledge: new KnowledgeService({ bus, now }),
    governance: new GovernanceService({ bus, now }),
  };
}

test('enforcing mode without a CallContext rejects an unattributed service write', async () => {
  const { knowledge } = enforcingPlatform();
  await assert.rejects(
    () => knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Unattributed', definition: 'd', primaryLanguage: 'en' }),
    /actor/i,
    'an enforcing platform refuses writes that carry no acting actor',
  );
});

test('runWithContext attributes EVERY fact across services to the actor + tenant', async () => {
  const { bus, knowledge, governance } = enforcingPlatform();

  const ko = await runWithContext({ actorId: ACTOR, organizationId: ORG }, async () => {
    assert.equal(currentContext()?.actorId, ACTOR, 'context is visible inside the scope');
    const concept = await knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Sincerity', definition: 'Purity of intention', primaryLanguage: 'en' });
    await knowledge.addVocabulary(concept.id, { language: 'ar', preferredTerm: 'Ikhlas' });
    await governance.requestApproval({ subjectId: concept.id, reviewers: ['Editor'], mode: 'Single' });
    return concept;
  });

  assert.ok(ko.id, 'the attributed flow completed under enforcement');
  const facts = await bus.eventLog.read(1);
  assert.ok(facts.length >= 3, 'facts were recorded across Knowledge and Governance');
  for (const s of facts) {
    assert.equal(s.event.identity.actorId, ACTOR, `every fact is attributed to the actor (${s.event.identity.type})`);
    assert.equal(s.event.identity.organizationId, ORG, `every fact carries the tenant (${s.event.identity.type})`);
  }

  // Outside the scope, the ambient context is gone (no leakage between operations).
  assert.equal(currentContext(), undefined, 'context does not leak past its scope');
});

test('explicit attribution on the event wins over the ambient context', async () => {
  const { bus, knowledge } = enforcingPlatform();
  const explicitOrg = newCanonicalId('Organization');
  await runWithContext({ actorId: ACTOR, organizationId: ORG }, async () => {
    // createKnowledge with an explicit organizationId: the service's value must win.
    await knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Tenant', definition: 'd', primaryLanguage: 'en', organizationId: explicitOrg });
  });
  const facts = await bus.eventLog.read(1);
  const created = facts.find((s) => s.event.identity.type === 'ConceptCreated');
  assert.ok(created);
  assert.equal(created!.event.identity.organizationId, explicitOrg, 'explicit org overrides ambient org');
  assert.equal(created!.event.identity.actorId, ACTOR, 'actor still stamped from context');
});
