/**
 * M1 cross-engine integration test (Readiness Report §10.10, KMOS-0204 §31 flow).
 *
 * Exercises the five Foundational Institutional Engines together on ONE shared
 * canonical event bus, following a lecture-preservation journey:
 *
 *   Identity (actor)  ->  Asset Registry (evidence + lineage)  ->
 *   Knowledge (meaning + relationships)  ->  Governance (approval + trust)  ->
 *   Knowledge approved/published.
 *
 * Proves: engines are loosely coupled through canonical events; institutional
 * history accumulates in one append-only log; the whole journey is replayable.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type Projection, type StoredEvent } from '@kmos/canonical-kernel';
import { EventService } from '@kmos/events';
import { IdentityService } from '@kmos/identity';
import { AssetRegistryService } from '@kmos/assets';
import { KnowledgeService } from '@kmos/knowledge';
import { GovernanceService, createGovernanceCatalog } from '@kmos/governance';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

test('lecture flow: identity -> assets+lineage -> knowledge -> governance -> approval, on one shared bus', async () => {
  // One shared bus whose catalog carries every engine's event types.
  const bus = new EventBus({ catalog: createGovernanceCatalog() });
  const events = new EventService({ bus, now: fixedNow });
  const identity = new IdentityService({ bus, now: fixedNow });
  const assets = new AssetRegistryService({ bus, now: fixedNow });
  const knowledge = new KnowledgeService({ bus, now: fixedNow });
  const governance = new GovernanceService({ bus, now: fixedNow });

  // 1) Identity: an editor in an organization (accountability).
  const org = await identity.createOrganization('Institute');
  const editor = await identity.createIdentity({ kind: 'Human', displayName: 'Editor', organizationId: org.id });
  assert.ok(editor.id.startsWith('kmos:Identity:'));

  // 2) Asset Registry: register the lecture video, derive audio then transcript; record lineage.
  const sref = (id: string) => ({ storageId: id, backend: 'object' as const });
  const video = await assets.registerAsset({
    assetType: 'Media', mediaType: 'video/mp4', displayName: 'Lecture', organizationId: org.id,
    storageRef: sref('s-video'), checksum: 'sha256:video', provenance: { origin: 'Ingested' },
  });
  const audio = await assets.registerAsset({
    assetType: 'Media', mediaType: 'audio/wav', displayName: 'Lecture audio', organizationId: org.id,
    storageRef: sref('s-audio'), checksum: 'sha256:audio',
    provenance: { origin: 'DerivedByCapability', sourceAssetIds: [video.id] },
  });
  const transcript = await assets.registerAsset({
    assetType: 'Document', mediaType: 'text/plain', displayName: 'Transcript', organizationId: org.id,
    storageRef: sref('s-transcript'), checksum: 'sha256:transcript',
    provenance: { origin: 'DerivedByCapability', sourceAssetIds: [audio.id] },
  });
  await assets.recordDerivation({ derivedAssetId: audio.id, inputAssetIds: [video.id] });
  await assets.recordDerivation({ derivedAssetId: transcript.id, inputAssetIds: [audio.id] });

  // Lineage reconstructs the full derivation chain back to the source video.
  const lineage = assets.getLineage(transcript.id);
  const ancestorIds = new Set(lineage.ancestors);
  assert.ok(ancestorIds.has(audio.id) && ancestorIds.has(video.id), 'transcript lineage reaches the source video');

  // 3) Knowledge: a concept evidenced by the transcript, with vocabulary and a relationship.
  const sincerity = await knowledge.createKnowledge({
    category: 'Concept', canonicalName: 'Sincerity', definition: 'Purity of intention.',
    primaryLanguage: 'en', organizationId: org.id, evidenceRefs: [transcript.id], confidence: 0.9,
  });
  await knowledge.addVocabulary(sincerity.id, { language: 'ar', preferredTerm: 'Ikhlas', transliteration: 'ikhlāṣ' });
  const purification = await knowledge.createKnowledge({
    category: 'Concept', canonicalName: 'Purification', definition: 'Cleansing of the heart.',
    primaryLanguage: 'en', organizationId: org.id, evidenceRefs: [transcript.id],
  });
  const rel = await knowledge.createRelationship({ relation: 'Explains', sourceId: sincerity.id, targetId: purification.id, confidence: 0.8 });
  assert.equal(rel.type, 'Relationship');
  assert.equal(rel.body.sourceId, sincerity.id);

  // 4) Governance: approval + evidence-based trust assessment.
  const approval = await governance.requestApproval({ subjectId: sincerity.id, reviewers: ['Editor'], mode: 'Single' });
  await governance.grantApproval(approval.id, 'Editor', 'Reviewed against the transcript evidence.');
  const trust = await governance.assessTrust({
    subjectId: sincerity.id,
    evidence: { knowledgeProvenance: true, assetIntegrity: true, reviewerApproval: true, identityVerification: true, policyCompliance: true },
  });
  assert.equal(trust.trusted, true);
  assert.ok(trust.reasons.length > 0, 'trust decision is explainable');

  // 5) Knowledge: approve the now-trusted concept.
  const approved = await knowledge.approve(sincerity.id);
  assert.equal(approved.lifecycle, 'Approved');

  // --- Shared institutional history accumulated from ALL engines ---
  const log = await bus.eventLog.read(1);
  const types = new Set(log.map((s) => s.event.identity.type));
  for (const expected of ['IdentityCreated', 'AssetRegistered', 'ConceptCreated', 'RelationshipEstablished', 'ApprovalGranted', 'TrustAssessmentCompleted', 'KnowledgeApproved']) {
    assert.ok(types.has(expected), `shared log should contain ${expected}`);
  }
  assert.equal(bus.getDeadLetters().length, 0, 'no dead letters');

  // --- The whole journey is replayable from the immutable log ---
  const byProducer: Projection<Record<string, number>> = {
    name: 'events-by-producer',
    initial: () => ({}),
    apply: (state, s: StoredEvent) => ({ ...state, [s.event.identity.producer]: (state[s.event.identity.producer] ?? 0) + 1 }),
  };
  const { state } = await events.replayEvents(byProducer);
  assert.ok((state['AssetRegistry'] ?? 0) >= 3, 'asset events replayed');
  assert.ok((state['KnowledgeService'] ?? 0) >= 2, 'knowledge events replayed');
});
