import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventBus,
  isKmosError,
  newCanonicalId,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import { KnowledgeService } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

function makeService(): KnowledgeService {
  return new KnowledgeService({ now: fixedNow });
}

test('read-model recovery: hydrate() rebuilds every repository from the durable log (restart-identical)', async () => {
  const bus = new EventBus();
  const s1 = new KnowledgeService({ bus, now: fixedNow });
  const ko = await s1.createKnowledge({ category: 'Concept', canonicalName: 'Sincerity', definition: 'Purity of intention', primaryLanguage: 'en' });
  await s1.addVocabulary(ko.id, { language: 'ar', preferredTerm: 'Ikhlas' });
  const ko2 = await s1.createKnowledge({ category: 'Concept', canonicalName: 'Patience', definition: 'Endurance', primaryLanguage: 'en' });
  const rel = await s1.createRelationship({ relation: 'Explains', sourceId: ko.id, targetId: ko2.id, confidence: 0.8 });
  await s1.approve(ko.id); // lifecycle changes (append versions)

  // A fresh instance on the SAME durable bus/log — simulates a process restart.
  const s2 = new KnowledgeService({ bus, now: fixedNow });
  assert.equal(s2.getKnowledge(ko.id), undefined, 'a fresh instance has empty repositories before hydrate');
  await s2.hydrate();

  // Object retrieval is identical after recovery — full body, not just the graph node.
  const rebuilt = s2.getKnowledge(ko.id);
  assert.ok(rebuilt, 'object retrievable after hydrate');
  assert.equal(rebuilt!.body.definition, 'Purity of intention', 'full body recovered');
  assert.equal(rebuilt!.lifecycle, 'Approved', 'lifecycle change recovered');
  assert.deepEqual(s2.getKnowledge(ko.id), s1.getKnowledge(ko.id), 'head identical to pre-restart');
  assert.equal(s2.getHistory(ko.id).length, s1.getHistory(ko.id).length, 'version history depth identical');
  // Vocabulary, relationships, and the second concept all recovered.
  assert.equal(s2.getVocabulary(ko.id).length, 1, 'vocabulary recovered');
  assert.equal(s2.getVocabulary(ko.id)[0]!.body.preferredTerm, 'Ikhlas');
  assert.equal(s2.getRelationship(rel.id)?.body.sourceId, ko.id, 'relationship recovered');
  assert.ok(s2.getKnowledge(ko2.id), 'second concept recovered');
});

test('createKnowledge: creates a Draft/Created object with provenance and emits KnowledgeCreated (KMOS-0201)', async () => {
  const svc = makeService();
  const evidence = newCanonicalId('Asset');
  const ko = await svc.createKnowledge({
    category: 'Topic',
    canonicalName: 'Photosynthesis',
    definition: 'Conversion of light into chemical energy.',
    primaryLanguage: 'en',
    evidenceRefs: [evidence],
    confidence: 0.9,
  });

  assert.equal(ko.type, 'KnowledgeObject');
  assert.equal(ko.owner, 'KnowledgeService');
  assert.equal(ko.lifecycle, 'Created');
  assert.equal(ko.version, 1);
  assert.equal(ko.body.provenance.unverified, false);
  assert.deepEqual(ko.governance.evidenceRefs, [evidence]);

  const log = await svc.eventBus.eventLog.read(1);
  assert.equal(log.length, 1);
  assert.equal(log[0]!.event.identity.type, 'KnowledgeCreated');
});

test('createKnowledge without evidence is flagged unverified (KMOS-0201 provenance)', async () => {
  const svc = makeService();
  const ko = await svc.createKnowledge({
    category: 'Definition',
    canonicalName: 'Entropy',
    definition: 'A measure of disorder.',
    primaryLanguage: 'en',
  });
  assert.equal(ko.body.provenance.unverified, true);
  assert.equal(ko.body.provenance.confidence, 0);
});

test('updateKnowledge creates a NEW version, preserving immutable history (KMOS-0201)', async () => {
  const svc = makeService();
  const ko = await svc.createKnowledge({
    category: 'Topic',
    canonicalName: 'Gravity',
    definition: 'Attraction between masses.',
    primaryLanguage: 'en',
  });
  const v2 = await svc.updateKnowledge(ko.id, { definition: 'Curvature of spacetime.' }, 'general-relativity correction');

  assert.equal(v2.version, 2);
  assert.equal(v2.body.definition, 'Curvature of spacetime.');

  const history = svc.getHistory(ko.id);
  assert.equal(history.length, 2);
  assert.equal(history[0]!.version, 1);
  assert.equal(history[0]!.body.definition, 'Attraction between masses.', 'v1 must be preserved unchanged');
  assert.equal(history[1]!.version, 2);
  // Corrections never overwrite: head is v2, but v1 still readable.
  assert.equal(svc.getKnowledge(ko.id)!.version, 2);
});

test('Relationship is a first-class, versioned canonical object (KMOS-0201 §12)', async () => {
  const svc = makeService();
  const a = await svc.createKnowledge({ category: 'Topic', canonicalName: 'Cause', definition: 'x', primaryLanguage: 'en' });
  const b = await svc.createKnowledge({ category: 'Topic', canonicalName: 'Effect', definition: 'y', primaryLanguage: 'en' });

  const rel = await svc.createRelationship({ relation: 'Supports', sourceId: a.id, targetId: b.id, confidence: 0.7 });
  assert.equal(rel.type, 'Relationship');
  assert.equal(rel.owner, 'KnowledgeService');
  assert.equal(rel.version, 1);
  assert.equal(rel.body.relation, 'Supports');
  assert.equal(rel.body.sourceId, a.id);

  // Versioned like any knowledge object.
  const rel2 = await svc.updateRelationship(rel.id, { confidence: 0.95 }, 'stronger evidence');
  assert.equal(rel2.version, 2);
  assert.equal(rel2.body.provenance.confidence, 0.95);
  assert.equal(svc.getRelationshipHistory(rel.id).length, 2);
});

test('broken relationships are rejected — no orphaned edges (KMOS-0201 §12/§13)', async () => {
  const svc = makeService();
  const a = await svc.createKnowledge({ category: 'Topic', canonicalName: 'Real', definition: 'x', primaryLanguage: 'en' });
  const ghost = newCanonicalId('KnowledgeObject');

  await assert.rejects(
    () => svc.createRelationship({ relation: 'References', sourceId: a.id, targetId: ghost }),
    (err: unknown) => isKmosError(err) && err.category === 'NotFound' && err.code === 'knowledge.relationship.broken_target',
  );
  await assert.rejects(
    () => svc.createRelationship({ relation: 'References', sourceId: ghost, targetId: a.id }),
    (err: unknown) => isKmosError(err) && err.code === 'knowledge.relationship.broken_source',
  );
});

test('duplicate concept within same org+language is rejected with Conflict (KMOS-0201 §13)', async () => {
  const svc = makeService();
  const org = newCanonicalId('Organization');
  const first = await svc.createKnowledge({
    category: 'Concept',
    canonicalName: 'Tawhid',
    definition: 'Oneness.',
    primaryLanguage: 'ar',
    organizationId: org,
  });
  assert.equal(first.type, 'Concept');

  await assert.rejects(
    () =>
      svc.createKnowledge({
        category: 'Concept',
        canonicalName: 'Tawhid',
        definition: 'Duplicate.',
        primaryLanguage: 'ar',
        organizationId: org,
      }),
    (err: unknown) => isKmosError(err) && err.category === 'Conflict' && err.code === 'knowledge.concept.duplicate',
  );

  // The existing concept remains findable for callers who prefer reuse.
  const existing = svc.getConcept('Tawhid', 'ar', org);
  assert.equal(existing!.id, first.id);

  // Same name in a DIFFERENT language is NOT a duplicate.
  await assert.doesNotReject(() =>
    svc.createKnowledge({ category: 'Concept', canonicalName: 'Tawhid', definition: 'Oneness.', primaryLanguage: 'en', organizationId: org }),
  );
});

test('multilingual: one language-independent KO, many Vocabulary objects, no duplicate KO (KMOS-0130 §14)', async () => {
  const svc = makeService();
  const ko = await svc.createKnowledge({
    category: 'Concept',
    canonicalName: 'Water',
    definition: 'H2O.',
    primaryLanguage: 'en',
  });

  const en = await svc.addVocabulary(ko.id, { language: 'en', preferredTerm: 'Water', aliases: ['H2O'] });
  const fr = await svc.addVocabulary(ko.id, { language: 'fr', preferredTerm: 'Eau' });
  const ar = await svc.addVocabulary(ko.id, { language: 'ar', preferredTerm: 'ماء', transliteration: 'maa' });

  // All three vocab objects reference the SAME KnowledgeObject.
  assert.equal(en.body.knowledgeId, ko.id);
  assert.equal(fr.body.knowledgeId, ko.id);
  assert.equal(ar.body.knowledgeId, ko.id);
  assert.equal(ar.body.transliteration, 'maa');

  const vocab = svc.getVocabulary(ko.id);
  assert.equal(vocab.length, 3);

  // The KnowledgeObject was NOT duplicated: still exactly one KO head.
  const graph = svc.buildGraphProjection();
  const koNodes = graph.nodes.filter((n) => n.id === ko.id);
  assert.equal(koNodes.length, 1);
});

test('approval workflow advances the canonical lifecycle and emits KnowledgeApproved (KMOS-0201)', async () => {
  const svc = makeService();
  const ko = await svc.createKnowledge({ category: 'Teaching', canonicalName: 'Lesson 1', definition: 'x', primaryLanguage: 'en' });
  const approved = await svc.approve(ko.id);
  assert.equal(approved.lifecycle, 'Approved');

  const types = (await svc.eventBus.eventLog.read(1)).map((s) => s.event.identity.type);
  assert.ok(types.includes('KnowledgeApproved'), 'KnowledgeApproved must be published');

  // Illegal transitions are rejected.
  await assert.rejects(
    () => svc.advanceLifecycle(ko.id, 'Created'),
    (err: unknown) => isKmosError(err) && err.code === 'knowledge.lifecycle.illegal_transition',
  );
});

test('graph projection: derived from authoritative objects and regenerable from the event log (KMOS-0201 §12)', async () => {
  const svc = makeService();
  const a = await svc.createKnowledge({ category: 'Topic', canonicalName: 'A', definition: 'a', primaryLanguage: 'en' });
  const b = await svc.createKnowledge({ category: 'Topic', canonicalName: 'B', definition: 'b', primaryLanguage: 'en' });
  const rel = await svc.createRelationship({ relation: 'RelatedTo', sourceId: a.id, targetId: b.id });

  const fromStore = svc.buildGraphProjection();
  assert.equal(fromStore.nodes.length, 2);
  assert.equal(fromStore.edges.length, 1);
  assert.equal(fromStore.edges[0]!.relationshipId, rel.id);
  assert.equal(fromStore.edges[0]!.sourceId, a.id);

  // Regenerate the graph purely by folding the immutable event log.
  const fromEvents = await svc.buildGraphFromEvents();
  assert.equal(fromEvents.nodes.length, 2);
  assert.equal(fromEvents.edges.length, 1);

  // Both derivations agree (graph is a function of authoritative state).
  const nodeIds = (g: { nodes: { id: string }[] }) => g.nodes.map((n) => n.id).sort();
  const edgeIds = (g: { edges: { relationshipId: string }[] }) => g.edges.map((e) => e.relationshipId).sort();
  assert.deepEqual(nodeIds(fromStore), nodeIds(fromEvents));
  assert.deepEqual(edgeIds(fromStore), edgeIds(fromEvents));

  // The KnowledgeObjects remain authoritative: the head store is unchanged and
  // a freshly built graph equals the prior one (regeneration is idempotent).
  const regen = svc.buildGraphProjection();
  assert.deepEqual(nodeIds(regen), nodeIds(fromStore));
  assert.equal(svc.getKnowledge(a.id)!.version, 1, 'building the projection must not mutate authoritative objects');
});

test('constructor accepts an injected EventBus and publishes every meaningful change', async () => {
  const received: string[] = [];
  const bus = new EventBus();
  bus.subscribe({
    subscriber: 'probe',
    eventTypes: ['*'],
    handler: (s: StoredEvent) => {
      received.push(s.event.identity.type);
    },
  });
  const svc = new KnowledgeService({ bus, now: fixedNow });
  const a = await svc.createKnowledge({ category: 'Topic', canonicalName: 'A', definition: 'a', primaryLanguage: 'en' });
  const b = await svc.createKnowledge({ category: 'Concept', canonicalName: 'B', definition: 'b', primaryLanguage: 'en' });
  await svc.addVocabulary(b.id, { language: 'fr', preferredTerm: 'Bee' });
  await svc.createRelationship({ relation: 'Defines', sourceId: b.id, targetId: a.id });
  await svc.createCollection('set', [a.id, b.id]);

  // allow async dispatch microtasks to settle
  await Promise.resolve();
  assert.ok(received.includes('KnowledgeCreated'));
  assert.ok(received.includes('ConceptCreated'));
  assert.ok(received.includes('VocabularyExpanded'));
  assert.ok(received.includes('RelationshipEstablished'));
  assert.ok(received.includes('OntologyExtended'));
});
