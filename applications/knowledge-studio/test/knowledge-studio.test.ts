import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '@kmos/canonical-kernel';
import { KnowledgeService } from '@kmos/knowledge';
import { SearchService } from '@kmos/search';
import { createSearchCatalog } from '@kmos/search';
import { KnowledgeStudio } from '../src/index.js';

const now = () => '2026-06-30T00:00:00.000Z';

function wire() {
  // Knowledge + Search share a bus whose catalog covers both (search extends the seed).
  const bus = new EventBus({ catalog: createSearchCatalog() });
  const knowledge = new KnowledgeService({ bus, now });
  const search = new SearchService({ bus, now });
  const studio = new KnowledgeStudio({ search, knowledge });
  return { bus, knowledge, search, studio };
}

test('Knowledge Studio: search finds concepts, shows detail, navigates relationships (thin facade)', async () => {
  const { knowledge, studio } = wire();
  const sincerity = await knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Sincerity', definition: 'Purity of intention', primaryLanguage: 'en' });
  const purification = await knowledge.createKnowledge({ category: 'Concept', canonicalName: 'Purification', definition: 'Cleansing', primaryLanguage: 'en' });
  await knowledge.addVocabulary(sincerity.id, { language: 'ar', preferredTerm: 'Ikhlas' });
  const rel = await knowledge.createRelationship({ relation: 'Explains', sourceId: sincerity.id, targetId: purification.id });

  // search is event-driven: ConceptCreated events were indexed on the shared bus
  const hits = studio.find('Sincerity');
  assert.ok(hits.some((h) => h.subjectId === sincerity.id), 'search finds the concept');

  const detail = studio.conceptDetail(sincerity.id);
  assert.equal(detail?.knowledge.body.canonicalName, 'Sincerity');
  assert.equal(detail?.vocabulary.length, 1);

  const neighbours = studio.navigate(sincerity.id);
  assert.equal(neighbours.length, 1);
  assert.equal(neighbours[0]!.relation, 'Explains');
  assert.equal(neighbours[0]!.otherId, purification.id);
  assert.equal(studio.getRelationship(rel.id)?.id, rel.id);
});
