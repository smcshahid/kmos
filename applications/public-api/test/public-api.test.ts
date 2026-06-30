import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, createEvent } from '@kmos/canonical-kernel';
import type { StoredEvent } from '@kmos/canonical-kernel';
import { KnowledgeService } from '@kmos/knowledge';
import { AssetRegistryService } from '@kmos/assets';
import { SearchService } from '@kmos/search';
import { EventService } from '@kmos/events';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { PublicApi } from '../src/index.js';

const now = (): string => '2026-06-30T00:00:00.000Z';

/**
 * Wire Knowledge + Assets + Search + Events on ONE shared bus whose catalog
 * (createPlatformCatalog) covers every event type all four services publish, so
 * event-driven indexing/subscriptions validate (KMOS-0180 single-shared-bus
 * composition). The Event Service wraps the SAME bus.
 */
function wire() {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const knowledge = new KnowledgeService({ bus, now });
  const assets = new AssetRegistryService({ bus, now });
  const search = new SearchService({ bus, now });
  const events = new EventService({ bus, now });
  const api = new PublicApi({ knowledge, assets, search, events });
  return { bus, knowledge, assets, search, events, api };
}

/** Let fire-and-forget event delivery (void publish) settle. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('kmos:');
}

test('createKnowledge returns a canonical KnowledgeObject with a kmos: identifier', async () => {
  const { api } = wire();
  const ko = await api.createKnowledge({
    category: 'Concept',
    canonicalName: 'Sincerity',
    definition: 'Purity of intention',
    primaryLanguage: 'en',
  });
  assert.ok(isCanonicalId(ko.id), 'id is a canonical kmos: identifier');
  assert.equal(ko.body.canonicalName, 'Sincerity');
  assert.equal(ko.owner, 'KnowledgeService');
  // No implementation/storage shapes leak: a canonical object exposes only the
  // canonical envelope + a typed body, never repository/row fields.
  assert.equal(typeof ko.type, 'string');
  assert.equal(typeof ko.version, 'number');
  assert.equal(typeof ko.lifecycle, 'string');
});

test('getKnowledge returns the canonical object by canonical id', async () => {
  const { api } = wire();
  const created = await api.createKnowledge({
    category: 'Definition',
    canonicalName: 'Purification',
    definition: 'Cleansing',
    primaryLanguage: 'en',
  });
  const fetched = api.getKnowledge(created.id);
  assert.ok(fetched, 'knowledge is found');
  assert.equal(fetched!.id, created.id);
  assert.ok(isCanonicalId(fetched!.id));
  assert.equal(fetched!.body.definition, 'Cleansing');
});

test('getAsset returns a canonical Asset object with no storage internals leaked', async () => {
  const { api } = wire();
  const asset = await api.registerAsset({
    assetType: 'Document',
    mediaType: 'application/pdf',
    displayName: 'Lecture Notes',
    storageRef: { storageId: 'store-1', backend: 'object', location: 'bucket/lectures' },
    checksum: 'deadbeef',
    provenance: { origin: 'Ingested' },
  });
  assert.ok(isCanonicalId(asset.id), 'asset id is a canonical kmos: identifier');

  const fetched = api.getAsset(asset.id);
  assert.equal(fetched.id, asset.id);
  assert.equal(fetched.owner, 'AssetRegistry');
  // Identity is independent of storage; the canonical body references a logical
  // storageId only, never a real path/URL of record (KMOS-0202 §11/§17).
  assert.equal(fetched.body.currentStorage.storageId, 'store-1');
  assert.ok(isCanonicalId(fetched.body.currentVersionId));
  assert.ok(isCanonicalId(fetched.body.provenanceId));
});

test('searchKnowledge finds a created concept (event-driven indexing on the shared bus)', async () => {
  const { api } = wire();
  const ko = await api.createKnowledge({
    category: 'Concept',
    canonicalName: 'Patience',
    definition: 'Steadfast endurance',
    primaryLanguage: 'en',
  });
  await tick(); // ConceptCreated indexed via events on the shared bus

  const hits = api.searchKnowledge('Patience');
  assert.ok(hits.some((h) => h.subjectId === ko.id), 'search finds the concept');
  // Hits reference canonical identifiers only (KMOS-0180 §"Canonical Resources").
  for (const h of hits) assert.ok(isCanonicalId(h.subjectId));
});

test('subscribe receives a canonical event when one is published', async () => {
  const { api, bus } = wire();
  const received: StoredEvent[] = [];
  await api.subscribe('external-consumer', ['ConceptCreated'], (stored) => {
    received.push(stored);
  });

  const ko = await api.createKnowledge({
    category: 'Concept',
    canonicalName: 'Gratitude',
    definition: 'Thankfulness',
    primaryLanguage: 'en',
  });
  await tick();

  assert.equal(received.length, 1, 'subscriber received exactly one event');
  const ev = received[0]!.event;
  assert.equal(ev.identity.type, 'ConceptCreated');
  assert.equal(ev.identity.subjectId, ko.id);
  assert.ok(isCanonicalId(ev.identity.subjectId!), 'event subject is canonical');
  // Sanity: bus is the shared one (subscription delivered through it).
  assert.ok(bus instanceof EventBus);
});

test('getEventHistory returns canonical events for a stream', async () => {
  const { api } = wire();
  const ko = await api.createKnowledge({
    category: 'Concept',
    canonicalName: 'Mercy',
    definition: 'Compassion',
    primaryLanguage: 'en',
  });
  await tick();

  const history = await api.getEventHistory(ko.id);
  assert.ok(history.length >= 1, 'stream has at least the creation event');
  const types = history.map((s) => s.event.identity.type);
  assert.ok(types.includes('ConceptCreated'));
  for (const s of history) {
    assert.ok(isCanonicalId(s.event.identity.subjectId!), 'every event subject is canonical');
    // Canonical event shape only (identity/payload/governance) — no broker rows.
    assert.ok('identity' in s.event && 'payload' in s.event && 'governance' in s.event);
  }
});

test('no implementation types leak: returned values are canonical objects/events only', async () => {
  const { api, bus } = wire();
  const ko = await api.createKnowledge({
    category: 'Concept',
    canonicalName: 'Trust',
    definition: 'Reliance',
    primaryLanguage: 'en',
  });
  // KnowledgeObject is a canonical object: it MUST carry the canonical envelope
  // fields and MUST NOT carry repository/storage markers.
  for (const field of ['id', 'type', 'owner', 'version', 'lifecycle', 'body']) {
    assert.ok(field in ko, `canonical envelope field ${field} present`);
  }
  // Publish a raw canonical event on the shared bus; the facade exposes it back
  // as a CANONICAL event (identity/payload/governance) via getEventHistory.
  const ev = createEvent({
    type: 'ConceptCreated',
    schemaVersion: '1.0',
    producer: 'TestProducer',
    subjectId: ko.id,
    payload: { knowledgeId: ko.id },
    time: now(),
  });
  await bus.publish(ev, { streamId: ko.id });
  await tick();

  const history = await api.getEventHistory(ko.id);
  const probe = history.find((s) => s.event.identity.producer === 'TestProducer');
  assert.ok(probe, 'the published canonical event is readable through the facade');
  assert.deepEqual(Object.keys(probe!.event).sort(), ['governance', 'identity', 'payload']);
});
