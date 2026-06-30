/**
 * M4 integration: applications are interchangeable THIN views over the same
 * institutional knowledge + evidence (KMOS-9999 §9; KMOS-0009).
 *
 * The Public API creates knowledge and registers evidence; the Knowledge Studio
 * then discovers that knowledge; the Archive Explorer inspects the same
 * evidence's lineage + integrity. All over ONE shared platform — no app owns
 * business logic or state.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventBus } from '@kmos/canonical-kernel';
import { KnowledgeService } from '@kmos/knowledge';
import { AssetRegistryService } from '@kmos/assets';
import { SearchService } from '@kmos/search';
import { EventService } from '@kmos/events';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { PublicApi } from '@kmos/public-api';
import { KnowledgeStudio } from '@kmos/knowledge-studio';
import { ArchiveExplorer } from '@kmos/archive-explorer';

const now = () => '2026-06-30T00:00:00.000Z';
const sha256 = (t: string) => createHash('sha256').update(new TextEncoder().encode(t)).digest('hex');

test('apps as interchangeable views: Public API writes -> Studio reads -> Explorer inspects evidence', async () => {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const knowledge = new KnowledgeService({ bus, now });
  const assets = new AssetRegistryService({ bus, now });
  const search = new SearchService({ bus, now });
  const events = new EventService({ bus, now });

  const api = new PublicApi({ knowledge, assets, search, events });
  const studio = new KnowledgeStudio({ search, knowledge });
  const explorer = new ArchiveExplorer({ assets });

  // 1) Public API registers evidence + creates knowledge that cites it.
  const content = 'Lecture transcript on Sincerity';
  const asset = await api.registerAsset({
    assetType: 'Document', mediaType: 'text/plain', displayName: 'Transcript',
    storageRef: { storageId: 's-1', backend: 'object' }, checksum: sha256(content), content: new TextEncoder().encode(content),
    provenance: { origin: 'Ingested' },
  });
  const concept = await api.createKnowledge({ category: 'Concept', canonicalName: 'Sincerity', definition: 'Purity of intention', primaryLanguage: 'en', evidenceRefs: [asset.id] });

  // 2) Knowledge Studio (a different app) discovers the same knowledge.
  const hits = studio.find('Sincerity');
  assert.ok(hits.some((h) => h.subjectId === concept.id), 'Studio finds knowledge written via the Public API');
  assert.equal(studio.conceptDetail(concept.id)?.knowledge.id, concept.id);

  // 3) Archive Explorer (another app) inspects the same evidence.
  const view = explorer.getAssetView(asset.id);
  assert.equal(view.asset.id, asset.id);
  const review = await explorer.evidenceReview(asset.id);
  assert.equal(review.integrity.ok, true, 'evidence integrity verifies across the shared platform');

  // The Public API exposes the same canonical objects + event history.
  assert.equal(api.getKnowledge(concept.id)?.id, concept.id);
  assert.ok((await api.getEventHistory(concept.id)).length >= 1);
});
