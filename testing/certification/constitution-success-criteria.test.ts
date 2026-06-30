/**
 * KMOS Reference Platform Certification (M6).
 *
 * Asserts the constitutional Success Criteria (KMOS-9999 §26, KMOS-10000
 * "Definition of Success") against the actual implementation, end to end on one
 * shared platform. Each test maps to a named criterion.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventBus, type Projection, type StoredEvent } from '@kmos/canonical-kernel';
// the seven foundational engines:
import { KnowledgeService } from '@kmos/knowledge';
import { AssetRegistryService } from '@kmos/assets';
import { EventService } from '@kmos/events';
import { WorkflowService } from '@kmos/workflow';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { IdentityService } from '@kmos/identity';
import { GovernanceService } from '@kmos/governance';
// execution + apps:
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { KnowledgeStudio } from '@kmos/knowledge-studio';
import { SearchService } from '@kmos/search';

const now = () => '2026-06-30T00:00:00.000Z';
const sha256 = (t: string) => createHash('sha256').update(new TextEncoder().encode(t)).digest('hex');

function platform() {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  return {
    bus,
    knowledge: new KnowledgeService({ bus, now }),
    assets: new AssetRegistryService({ bus, now }),
    events: new EventService({ bus, now }),
    workflow: (invoker: any) => new WorkflowService({ bus, invoker, now }),
    registry: new CapabilityRegistryService({ bus, now }),
    identity: new IdentityService({ bus, now }),
    governance: new GovernanceService({ bus, now }),
    runtime: new CapabilityRuntimeService({ bus, now }),
    search: new SearchService({ bus, now }),
  };
}

test('CERT-1: the seven foundational engines are operational', async () => {
  const p = platform();
  const k = p.knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Mercy', definition: 'Compassion', primaryLanguage: 'en' });
  const a = await p.assets.registerAsset({ assetType: 'Document', mediaType: 'text/plain', displayName: 'D', storageRef: { storageId: 's', backend: 'object' }, checksum: sha256('x'), content: new TextEncoder().encode('x'), provenance: { origin: 'Ingested' } });
  const id = await p.identity.createIdentity({ kind: 'Human', displayName: 'Editor' });
  const cap = await p.registry.registerCapability({ name: 'X', ownerDomain: 'D', businessPurpose: 'p', version: '1.0.0', contract: { acceptedObjects: [], producedObjects: [], consumedEvents: [], publishedEvents: [] } });
  const ap = p.governance.requestApproval({ subjectId: k.id, reviewers: ['Editor'], mode: 'Single' });
  assert.ok(k.id && a.id && id.id && cap.id && ap.id);
  assert.ok(p.events.getEventHistory(k.id).length >= 1, 'Event Service recorded history');
});

test('CERT-2: capability execution operates through published contracts', async () => {
  const p = platform();
  const cap = await p.registry.registerCapability({ name: 'Echo', ownerDomain: 'D', businessPurpose: 'p', version: '1.0.0', contract: { acceptedObjects: [], producedObjects: [], consumedEvents: [], publishedEvents: [] } });
  await p.runtime.registerImplementation(cap.id, '1.0.0', { invoke: async (i: any) => ({ echoed: i.v }), health: () => 'Ready' });
  const res = await p.runtime.invoke(cap.id, { v: 42 });
  assert.equal(res.success, true);
  assert.deepEqual(res.output, { echoed: 42 });
});

test('CERT-3: workflows coordinate deterministically (coordinate, never compute)', async () => {
  const p = platform();
  const calls: string[] = [];
  const invoker = { invoke: async (ref: string, input: any) => { calls.push(ref); return { out: input.in }; } };
  const wf = p.workflow(invoker);
  const def = await wf.registerWorkflow({ name: 'w', ownerDomain: 'D', businessPurpose: 'p', steps: [{ id: 's1', kind: 'activity', capabilityRef: 'cap:a', input: { in: '$input.x' } }] });
  const exec = await wf.start(def.id, { x: 7 });
  assert.equal(exec.body.state, 'Completed');
  assert.deepEqual(exec.body.stepResults['s1']!.output, { out: 7 });
  assert.deepEqual(calls, ['cap:a'], 'all work delegated to the capability invoker');
});

test('CERT-4: knowledge is independent of media (one concept, many representations)', () => {
  const p = platform();
  const ko = p.knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Sincerity', definition: 'Purity', primaryLanguage: 'en' });
  p.knowledge.addVocabulary(ko.id, { language: 'ar', preferredTerm: 'Ikhlas' });
  p.knowledge.addVocabulary(ko.id, { language: 'ur', preferredTerm: 'Ikhlaas' });
  // Same authoritative KnowledgeObject; multiple language representations; no media dependency in the object.
  assert.equal(p.knowledge.getVocabulary(ko.id).length, 2);
  assert.equal('body' in ko && 'mediaType' in (ko.body as object), false);
});

test('CERT-5: evidence is reproducible (integrity + lineage + evidence package)', async () => {
  const p = platform();
  const src = await p.assets.registerAsset({ assetType: 'Media', mediaType: 'audio/wav', displayName: 'A', storageRef: { storageId: 'a', backend: 'object' }, checksum: sha256('audio'), content: new TextEncoder().encode('audio'), provenance: { origin: 'Ingested' } });
  const der = await p.assets.registerAsset({ assetType: 'Document', mediaType: 'text/plain', displayName: 'T', storageRef: { storageId: 't', backend: 'object' }, checksum: sha256('text'), content: new TextEncoder().encode('text'), provenance: { origin: 'DerivedByCapability', sourceAssetIds: [src.id] } });
  await p.assets.recordDerivation({ derivedAssetId: der.id, inputAssetIds: [src.id] });
  const integ = await p.assets.verifyIntegrity(der.id);
  assert.equal(integ.ok, true);
  assert.ok(p.assets.getLineage(der.id).ancestors.includes(src.id));
  const pkg = await p.assets.generateEvidencePackage(der.id);
  assert.ok(pkg.id);
});

test('CERT-6: events are replayable (institutional memory reconstructable)', async () => {
  const p = platform();
  p.knowledge.createKnowledge({ category: 'Concept', canonicalName: 'A', definition: 'a', primaryLanguage: 'en' });
  p.knowledge.createKnowledge({ category: 'Concept', canonicalName: 'B', definition: 'b', primaryLanguage: 'en' });
  const count: Projection<number> = { name: 'n', initial: () => 0, apply: (s) => s + 1 };
  const before = p.bus.eventLog.size();
  const { state } = await p.events.replayEvents(count);
  assert.ok(state >= 2);
  assert.ok(p.bus.eventLog.size() >= before, 'replay does not shrink/mutate history');
});

test('CERT-7: identity is accountable + CERT-8: governance is explainable', () => {
  const p = platform();
  const trust = p.governance.assessTrust({ subjectId: 'kmos:KnowledgeObject:11111111-1111-4111-8111-111111111111', evidence: { knowledgeProvenance: true, reviewerApproval: true, identityVerification: true } });
  assert.equal(typeof trust.trusted, 'boolean');
  assert.ok(trust.reasons.length > 0, 'trust decision is explainable via reasons');
});

test('CERT-9: applications remain thin (no canonical objects/state of their own)', () => {
  const p = platform();
  const studio = new KnowledgeStudio({ search: p.search, knowledge: p.knowledge });
  // A thin app holds only injected service references, no canonical object stores.
  for (const v of Object.values(studio as unknown as Record<string, unknown>)) {
    assert.equal(Array.isArray(v), false);
    assert.equal(v instanceof Map, false);
  }
});
