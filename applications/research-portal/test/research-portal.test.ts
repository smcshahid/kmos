import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '@kmos/canonical-kernel';
import { KnowledgeService } from '@kmos/knowledge';
import { SearchService, createSearchCatalog } from '@kmos/search';
import { AssetRegistryService } from '@kmos/assets';
import { ResearchPortal } from '../src/index.js';

const now = () => '2026-06-30T00:00:00.000Z';

async function wire() {
  // Knowledge + Search share ONE bus whose catalog covers both (search extends
  // the seed). The Asset Registry is the system of record for evidence Assets;
  // the portal resolves citations through its API, not via events, so it keeps
  // its own default bus.
  const bus = new EventBus({ catalog: createSearchCatalog() });
  const knowledge = new KnowledgeService({ bus, now });
  const search = new SearchService({ bus, now });
  const assets = new AssetRegistryService({ now });
  const portal = new ResearchPortal({ search, knowledge, assets });

  // Register an Asset to serve as evidence for a concept.
  const evidence = await assets.registerAsset({
    assetType: 'Document',
    mediaType: 'application/pdf',
    displayName: 'Treatise on Sincerity',
    storageRef: { storageId: 'store-1', backend: 'object' },
    checksum: 'abc123',
    provenance: { origin: 'Ingested' },
  });

  return { bus, knowledge, search, assets, portal, evidence };
}

test('Research Portal: semanticSearch finds a concept (thin delegate to Search)', async () => {
  const { knowledge, portal, evidence } = await wire();
  const sincerity = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Sincerity',
    definition: 'Purity of intention',
    primaryLanguage: 'en',
    evidenceRefs: [evidence.id],
  });

  const hits = portal.semanticSearch('Sincerity');
  assert.ok(hits.some((h) => h.subjectId === sincerity.id), 'semantic search finds the concept');
});

test('Research Portal: answerQuestion assembles concept + its citation Asset', async () => {
  const { knowledge, portal, evidence } = await wire();
  const sincerity = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Sincerity',
    definition: 'Purity of intention',
    primaryLanguage: 'en',
    evidenceRefs: [evidence.id],
  });

  const answer = portal.answerQuestion('Sincerity');
  assert.equal(answer.query, 'Sincerity');
  assert.equal(answer.concepts.length, 1);
  assert.equal(answer.concepts[0]!.id, sincerity.id);
  assert.equal(answer.concepts[0]!.canonicalName, 'Sincerity');
  assert.equal(answer.concepts[0]!.definition, 'Purity of intention');
  assert.equal(answer.citations.length, 1);
  assert.equal(answer.citations[0]!.id, evidence.id);
  assert.equal(answer.citations[0]!.displayName, 'Treatise on Sincerity');
});

test('Research Portal: findCitations resolves evidence refs to Assets', async () => {
  const { knowledge, portal, evidence } = await wire();
  const sincerity = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Sincerity',
    definition: 'Purity of intention',
    primaryLanguage: 'en',
    evidenceRefs: [evidence.id],
  });

  const citations = portal.findCitations(sincerity.id);
  assert.equal(citations.length, 1);
  assert.equal(citations[0]!.id, evidence.id);

  // A concept with no evidence yields no citations (nothing invented).
  const purification = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Purification',
    definition: 'Cleansing',
    primaryLanguage: 'en',
  });
  assert.equal(portal.findCitations(purification.id).length, 0);
});

test('Research Portal: relatedConcepts returns a linked concept via the graph', async () => {
  const { knowledge, portal, evidence } = await wire();
  const sincerity = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Sincerity',
    definition: 'Purity of intention',
    primaryLanguage: 'en',
    evidenceRefs: [evidence.id],
  });
  const purification = await knowledge.createKnowledge({
    category: 'Concept',
    canonicalName: 'Purification',
    definition: 'Cleansing',
    primaryLanguage: 'en',
  });
  await knowledge.createRelationship({ relation: 'Explains', sourceId: sincerity.id, targetId: purification.id });

  const neighbours = portal.relatedConcepts(sincerity.id);
  assert.equal(neighbours.length, 1);
  assert.equal(neighbours[0]!.relation, 'Explains');
  assert.equal(neighbours[0]!.direction, 'outgoing');
  assert.equal(neighbours[0]!.otherId, purification.id);
});

test('Research Portal holds no canonical objects (it reads through services)', async () => {
  const { portal } = await wire();
  // The portal is a thin facade: it stores only the injected services, never
  // canonical objects of its own.
  for (const value of Object.values(portal as unknown as Record<string, unknown>)) {
    assert.equal(Array.isArray(value), false, 'no canonical-object collections held by the portal');
    const tag = Object.prototype.toString.call(value);
    assert.notEqual(tag, '[object Map]', 'no canonical-object stores held by the portal');
  }
});
