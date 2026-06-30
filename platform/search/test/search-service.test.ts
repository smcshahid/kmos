import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, createEvent, newCanonicalId, type CanonicalEvent } from '@kmos/canonical-kernel';
import {
  SearchService,
  createSearchCatalog,
  ClassificationAccessFilter,
  reciprocalRankFusion,
} from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** Build a bus whose catalog recognises both kernel + Search events. */
function searchBus(): EventBus {
  return new EventBus({ catalog: createSearchCatalog() });
}

function knowledgeCreated(name: string, opts: Partial<{ organizationId: string; tags: string[]; classification: string }> = {}): CanonicalEvent {
  const subjectId = newCanonicalId('KnowledgeObject');
  return createEvent({
    type: 'KnowledgeCreated',
    schemaVersion: '1.0',
    producer: 'KnowledgeService',
    subjectId,
    payload: {
      name,
      tags: opts.tags ?? [],
      ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
      ...(opts.classification ? { classification: opts.classification } : {}),
    },
    time: fixedNow(),
  });
}

function assetRegistered(name: string, opts: Partial<{ organizationId: string; tags: string[] }> = {}): CanonicalEvent {
  const subjectId = newCanonicalId('Asset');
  return createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    subjectId,
    payload: {
      name,
      type: 'Asset',
      tags: opts.tags ?? [],
      ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
    },
    time: fixedNow(),
  });
}

test('event-driven indexing: KnowledgeCreated + AssetRegistered become findable by keyword (KMOS-0208 §3)', async () => {
  const bus = searchBus();
  const svc = new SearchService({ bus, now: fixedNow });

  const k = knowledgeCreated('Quantum Computing Primer', { tags: ['physics', 'quantum'] });
  const a = assetRegistered('Quantum Lecture Recording', { tags: ['audio'] });
  await bus.publish(k, { streamId: k.identity.subjectId });
  await bus.publish(a, { streamId: a.identity.subjectId });

  assert.equal(svc.documentCount(), 2);

  const hits = svc.search('quantum');
  assert.equal(hits.length, 2);
  const ids = hits.map((h) => h.subjectId).sort();
  assert.deepEqual(ids, [k.identity.subjectId, a.identity.subjectId].sort());

  const onlyPrimer = svc.search('primer');
  assert.equal(onlyPrimer.length, 1);
  assert.equal(onlyPrimer[0]?.subjectId, k.identity.subjectId);
});

test('indexing is idempotent: re-delivering the same event does not duplicate (KMOS-0208 §3)', async () => {
  const bus = searchBus();
  const svc = new SearchService({ bus, now: fixedNow });

  const a = assetRegistered('Idempotent Asset', { tags: ['x'] });
  const stored = await bus.publish(a, { streamId: a.identity.subjectId });
  assert.equal(svc.documentCount(), 1);

  // Re-deliver the exact same stored event (at-least-once delivery simulation).
  await bus.redeliver(stored);
  assert.equal(svc.documentCount(), 1, 'redelivery must not duplicate the document');

  // Even a brand-new event for the SAME subject upserts (no duplicate doc).
  const reEvent = createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    subjectId: a.identity.subjectId,
    payload: { name: 'Idempotent Asset Renamed', type: 'Asset', tags: ['x'] },
    time: fixedNow(),
  });
  await bus.publish(reEvent, { streamId: a.identity.subjectId });
  assert.equal(svc.documentCount(), 1, 'upsert-by-subject-id keeps a single document');
  assert.equal(svc.getDocument(a.identity.subjectId!)?.body.fields.name, 'Idempotent Asset Renamed');
});

test('filter by type and organization (KMOS-0208 §3)', async () => {
  const bus = searchBus();
  const svc = new SearchService({ bus, now: fixedNow });

  const orgA = newCanonicalId('Organization');
  const orgB = newCanonicalId('Organization');
  const k = knowledgeCreated('Shared Report', { organizationId: orgA, tags: ['report'] });
  const a = assetRegistered('Shared Report Audio', { organizationId: orgB, tags: ['report'] });
  await bus.publish(k, { streamId: k.identity.subjectId });
  await bus.publish(a, { streamId: a.identity.subjectId });

  // Filter by canonical object type.
  const onlyAssets = svc.search('report', { type: 'Asset' });
  assert.equal(onlyAssets.length, 1);
  assert.equal(onlyAssets[0]?.subjectId, a.identity.subjectId);

  const onlyKnowledge = svc.search('report', { type: 'KnowledgeObject' });
  assert.equal(onlyKnowledge.length, 1);
  assert.equal(onlyKnowledge[0]?.subjectId, k.identity.subjectId);

  // Filter by organization.
  const orgScoped = svc.search('report', { organizationId: orgA });
  assert.equal(orgScoped.length, 1);
  assert.equal(orgScoped[0]?.subjectId, k.identity.subjectId);
});

test('hybrid query returns a fused (RRF) ranking (KMOS-0208 §3)', async () => {
  const bus = searchBus();
  const svc = new SearchService({ bus, now: fixedNow });

  const exact = knowledgeCreated('machine learning', { tags: ['ml', 'ai'] });
  const related = knowledgeCreated('deep learning networks', { tags: ['ml'] });
  const other = assetRegistered('cooking recipes', { tags: ['food'] });
  for (const ev of [exact, related, other]) {
    await bus.publish(ev, { streamId: ev.identity.subjectId });
  }

  const hits = svc.search('machine learning', { mode: 'hybrid' });
  assert.ok(hits.length >= 1, 'hybrid search returns results');
  // The exact lexical match should rank first under RRF.
  assert.equal(hits[0]?.subjectId, exact.identity.subjectId);
  // Scores are RRF sums (1/(k+rank)); top score must be positive and <= 2/(k+1).
  assert.ok((hits[0]?.score ?? 0) > 0);
  assert.ok((hits[0]?.score ?? 0) <= 2 / (60 + 1) + 1e-9);
});

test('rebuild() reconstructs the same index from the event log via replay, without mutating history (KMOS-0208 §3)', async () => {
  const bus = searchBus();
  const svc = new SearchService({ bus, now: fixedNow });

  const events = [
    knowledgeCreated('Alpha document', { tags: ['a'] }),
    assetRegistered('Beta asset', { tags: ['b'] }),
    knowledgeCreated('Gamma notes', { tags: ['c'] }),
  ];
  for (const ev of events) await bus.publish(ev, { streamId: ev.identity.subjectId });

  const beforeCount = svc.documentCount();
  const beforeHit = svc.search('gamma');
  const logSizeBefore = await bus.eventLog.size();

  const rebuilt = await svc.rebuild();

  // Index reconstructed identically.
  assert.equal(svc.documentCount(), beforeCount);
  assert.equal(rebuilt.body.documentCount, beforeCount);
  const afterHit = svc.search('gamma');
  assert.deepEqual(afterHit.map((h) => h.subjectId), beforeHit.map((h) => h.subjectId));
  for (const ev of events) {
    assert.ok(svc.getDocument(ev.identity.subjectId!), 'every subject present after rebuild');
  }

  // History is immutable: the log only GREW (by the IndexRebuilt event), and the
  // original canonical events are still present and unchanged.
  assert.ok((await bus.eventLog.size()) >= logSizeBefore, 'log is append-only (never shrinks)');
  for (const ev of events) {
    const stream = await bus.eventLog.readStream(ev.identity.subjectId!);
    assert.ok(stream.some((s) => s.event.identity.eventId === ev.identity.eventId), 'original event intact');
  }
});

test('AccessFilter removes unauthorized results (KMOS-0208 §3 governance-aware)', async () => {
  const bus = searchBus();
  const svc = new SearchService({
    bus,
    now: fixedNow,
    accessFilter: new ClassificationAccessFilter(),
  });

  const orgA = newCanonicalId('Organization');
  const publicDoc = knowledgeCreated('Public quantum overview', { organizationId: orgA, tags: ['q'], classification: 'Public' });
  const secretDoc = knowledgeCreated('Restricted quantum dossier', { organizationId: orgA, tags: ['q'], classification: 'Restricted' });
  await bus.publish(publicDoc, { streamId: publicDoc.identity.subjectId });
  await bus.publish(secretDoc, { streamId: secretDoc.identity.subjectId });

  // Caller in the org but without Restricted clearance: secret is filtered out.
  const limited = svc.search('quantum', { access: { organizationId: orgA, clearances: ['Public'] } });
  assert.equal(limited.length, 1);
  assert.equal(limited[0]?.subjectId, publicDoc.identity.subjectId);

  // Cleared caller sees both.
  const full = svc.search('quantum', { access: { organizationId: orgA, clearances: ['Public', 'Restricted'] } });
  assert.equal(full.length, 2);

  // Caller from another org sees neither org-scoped document.
  const outsider = svc.search('quantum', { access: { organizationId: newCanonicalId('Organization'), clearances: ['Public', 'Restricted'] } });
  assert.equal(outsider.length, 0);
});

test('reciprocalRankFusion fuses ranked lists with k=60 (KMOS-0208 §3)', () => {
  const fused = reciprocalRankFusion([['a', 'b'], ['b', 'a']], 60);
  // 'a': 1/61 + 1/62 ; 'b': 1/62 + 1/61 -> equal.
  assert.ok(Math.abs((fused.get('a') ?? 0) - (fused.get('b') ?? 0)) < 1e-12);
  // A document ranked #1 in both lists beats one ranked #2 in both.
  const fused2 = reciprocalRankFusion([['x', 'y'], ['x', 'y']], 60);
  assert.ok((fused2.get('x') ?? 0) > (fused2.get('y') ?? 0));
});
