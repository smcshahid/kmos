import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  EventBus,
  isCanonicalId,
  objectTypeOf,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import {
  AssetRegistryService,
  InMemoryStorageAdapter,
  type StorageReference,
} from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';
const sha256 = (s: string): string => createHash('sha256').update(Buffer.from(s)).digest('hex');
const bytes = (s: string): Uint8Array => new Uint8Array(Buffer.from(s));

function ref(storageId: string, backend = 'object'): StorageReference {
  return { storageId, backend };
}

test('registerAsset: creates Asset with canonical identity, version, provenance, lineage (KMOS-0202 §8/§11)', async () => {
  const svc = new AssetRegistryService({ now: fixedNow });
  const content = 'hello-asset';
  const asset = await svc.registerAsset({
    assetType: 'Video',
    mediaType: 'video/mp4',
    displayName: 'Keynote 2026',
    organizationId: undefined,
    storageRef: ref('blob/001'),
    checksum: sha256(content),
    content: bytes(content),
    provenance: { origin: 'Ingested', originalSource: 'camera-A', contributors: [{ kind: 'Human', id: 'kmos:Identity:11111111-1111-1111-1111-111111111111', role: 'producer' }] },
  });

  assert.ok(isCanonicalId(asset.id), 'asset id is a canonical identifier');
  assert.equal(objectTypeOf(asset.id), 'Asset');
  assert.equal(asset.owner, 'AssetRegistry');
  assert.equal(asset.type, 'Asset');
  assert.equal(asset.lifecycle, 'Created');
  assert.equal(asset.body.media.mediaType, 'video/mp4');

  // Identity must NOT be derived from storage id / filename / path.
  assert.ok(!asset.id.includes('blob/001'));
  assert.ok(!asset.id.includes('001'));

  const history = svc.getVersionHistory(asset.id);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.body.ordinal, 1);
  assert.equal(history[0]?.body.parentVersionId, undefined);

  const prov = svc.getProvenance(asset.id);
  assert.equal(prov.body.origin, 'Ingested');
  assert.equal(prov.body.contributors.length, 1);
});

test('canonical identity is stable across storage-reference change (storage independence) (KMOS-0202 §11/§17)', async () => {
  const storage = new InMemoryStorageAdapter();
  const svc = new AssetRegistryService({ now: fixedNow, storage });
  const content = 'migrate-me';
  const asset = await svc.registerAsset({
    assetType: 'Document',
    mediaType: 'application/pdf',
    displayName: 'Policy',
    storageRef: ref('fs/old/path.pdf', 'filesystem'),
    checksum: sha256(content),
    content: bytes(content),
    provenance: { origin: 'Ingested' },
  });
  const originalId = asset.id;

  // Simulate moving the bytes to a different backend / logical id.
  await storage.migrate('fs/old/path.pdf', 's3://bucket/new-key');
  const updated = await svc.updateStorageReference(originalId, ref('s3://bucket/new-key', 'object'));

  assert.equal(updated.id, originalId, 'identity is preserved across storage migration');
  assert.equal(updated.body.currentStorage.storageId, 's3://bucket/new-key');
  assert.equal(updated.body.currentStorage.backend, 'object');
  assert.equal(updated.body.currentVersionId, asset.body.currentVersionId, 'version chain preserved');

  // Integrity still verifies after migration (bytes followed the asset).
  const result = await svc.verifyIntegrity(originalId);
  assert.equal(result.ok, true);
});

test('immutable versioning: chain preserved with parent links, history never overwritten (KMOS-0202 §16)', async () => {
  const svc = new AssetRegistryService({ now: fixedNow });
  const c1 = 'v1';
  const asset = await svc.registerAsset({
    assetType: 'Transcript',
    mediaType: 'text/plain',
    displayName: 'Transcript',
    storageRef: ref('t/v1'),
    checksum: sha256(c1),
    content: bytes(c1),
    provenance: { origin: 'DerivedByCapability' },
  });
  const v1Id = asset.body.currentVersionId;

  const c2 = 'v2';
  const v2 = await svc.createVersion(asset.id, {
    reason: 'human correction',
    checksum: sha256(c2),
    storageRef: ref('t/v2'),
    content: bytes(c2),
    capabilityId: 'kmos:Capability:22222222-2222-2222-2222-222222222222',
    capabilityVersion: '1.4.0',
  });
  const c3 = 'v3';
  const v3 = await svc.createVersion(asset.id, {
    reason: 'second pass',
    checksum: sha256(c3),
    storageRef: ref('t/v3'),
    content: bytes(c3),
  });

  const history = svc.getVersionHistory(asset.id);
  assert.equal(history.length, 3);
  assert.deepEqual(history.map((v) => v.body.ordinal), [1, 2, 3]);
  assert.equal(v2.body.parentVersionId, v1Id);
  assert.equal(v3.body.parentVersionId, v2.id);
  assert.equal(v2.body.capabilityVersion, '1.4.0', 'capability version recorded for reproducibility');

  // Original version object is unchanged (immutability): checksum still v1's.
  assert.equal(svc.getVersion(v1Id)?.body.checksum, sha256('v1'));
  assert.notEqual(svc.getVersion(v1Id)?.body.checksum, svc.getVersion(v2.id)?.body.checksum);

  // Asset now points at the latest version but keeps the same identity.
  assert.equal(svc.getAsset(asset.id).body.currentVersionId, v3.id);
});

test('lineage graph reconstruction: multi-hop derivation (video -> audio -> transcript -> knowledge) (KMOS-0202 §14)', async () => {
  const svc = new AssetRegistryService({ now: fixedNow });
  const mk = async (type: 'Video' | 'Audio' | 'Transcript' | 'KnowledgePackage', name: string, sources: string[], cap?: string) =>
    (
      await svc.registerAsset({
        assetType: type,
        mediaType: 'application/octet-stream',
        displayName: name,
        storageRef: ref(`s/${name}`),
        checksum: sha256(name),
        provenance: { origin: sources.length ? 'DerivedByCapability' : 'Ingested', sourceAssetIds: sources, ...(cap ? { producingCapabilityId: cap } : {}) },
      })
    ).id;

  const video = await mk('Video', 'video', []);
  const audio = await mk('Audio', 'audio', [video], 'kmos:Capability:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  const transcript = await mk('Transcript', 'transcript', [audio], 'kmos:Capability:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  const knowledge = await mk('KnowledgePackage', 'knowledge', [transcript], 'kmos:Capability:cccccccc-cccc-cccc-cccc-cccccccccccc');

  // From the transcript: ancestors are audio + video; descendants is knowledge.
  const fromTranscript = svc.getLineage(transcript);
  assert.deepEqual(new Set(fromTranscript.ancestors), new Set([audio, video]));
  assert.deepEqual(new Set(fromTranscript.descendants), new Set([knowledge]));

  // From the video: no ancestors; descendants are the full downstream chain.
  const fromVideo = svc.getLineage(video);
  assert.equal(fromVideo.ancestors.length, 0);
  assert.deepEqual(new Set(fromVideo.descendants), new Set([audio, transcript, knowledge]));

  // From knowledge: ancestors are the full upstream chain.
  const fromKnowledge = svc.getLineage(knowledge);
  assert.deepEqual(new Set(fromKnowledge.ancestors), new Set([transcript, audio, video]));

  // Each derivation edge records the transformation capability (reproducibility).
  const audioEdge = fromVideo.edges.find((e) => e.derivedAssetId === audio);
  assert.equal(audioEdge?.transformationCapabilityId, 'kmos:Capability:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
});

test('integrity verification: pass and fail publish the correct events (KMOS-0202 §15)', async () => {
  const events: StoredEvent[] = [];
  const svc = new AssetRegistryService({ now: fixedNow });
  svc.eventBus.subscribe({ subscriber: 'spy', eventTypes: ['*'], handler: (s) => void events.push(s) });

  // PASS: stored bytes match recorded checksum.
  const good = await svc.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: 'good',
    storageRef: ref('g/1'),
    checksum: sha256('correct'),
    content: bytes('correct'),
    provenance: { origin: 'Ingested' },
  });
  const okResult = await svc.verifyIntegrity(good.id);
  assert.equal(okResult.ok, true);
  assert.equal(okResult.record.result, 'Verified');
  assert.ok(events.some((e) => e.event.identity.type === 'IntegrityVerified' && e.event.identity.subjectId === good.id));
  // Integrity record stored on the asset.
  assert.equal(svc.getAsset(good.id).body.integrity.length, 1);

  // FAIL: recorded checksum does NOT match the stored bytes.
  const bad = await svc.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: 'bad',
    storageRef: ref('b/1'),
    checksum: sha256('expected'),
    content: bytes('TAMPERED'),
    provenance: { origin: 'Ingested' },
  });
  const failResult = await svc.verifyIntegrity(bad.id);
  assert.equal(failResult.ok, false);
  assert.equal(failResult.record.result, 'Failed');
  assert.ok(events.some((e) => e.event.identity.type === 'IntegrityFailed' && e.event.identity.subjectId === bad.id));
});

test('evidence package: bundles asset, versions, provenance, lineage, integrity, event refs (KMOS-0202 §18)', async () => {
  const svc = new AssetRegistryService({ now: fixedNow });
  const source = await svc.registerAsset({
    assetType: 'Video',
    mediaType: 'video/mp4',
    displayName: 'source',
    storageRef: ref('e/src'),
    checksum: sha256('src'),
    content: bytes('src'),
    provenance: { origin: 'Ingested' },
  });
  const derived = await svc.registerAsset({
    assetType: 'Transcript',
    mediaType: 'text/plain',
    displayName: 'derived',
    storageRef: ref('e/d1'),
    checksum: sha256('d1'),
    content: bytes('d1'),
    provenance: { origin: 'DerivedByCapability', sourceAssetIds: [source.id], producingCapabilityId: 'kmos:Capability:dddddddd-dddd-dddd-dddd-dddddddddddd', producingCapabilityVersion: '2.0.0', workflowId: 'kmos:WorkflowExecution:eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' },
  });
  await svc.createVersion(derived.id, { reason: 'fix', checksum: sha256('d2'), storageRef: ref('e/d2'), content: bytes('d2') });
  await svc.verifyIntegrity(derived.id);

  const pkg = await svc.generateEvidencePackage(derived.id);
  assert.equal(pkg.type, 'EvidencePackage');
  assert.equal(pkg.owner, 'AssetRegistry');
  assert.equal(pkg.body.assetId, derived.id);
  assert.equal(pkg.body.assetVersionIds.length, 2, 'all versions bundled');
  assert.equal(pkg.body.provenanceId, derived.body.provenanceId);
  assert.equal(pkg.body.integrity.length, 1, 'integrity history bundled');
  assert.deepEqual(new Set(pkg.body.lineage.ancestors), new Set([source.id]));
  assert.ok(pkg.body.references.length > 0, 'related event references included');
  assert.ok(pkg.body.references.some((r) => r.targetType === 'AssetRegistered'));

  assert.ok(svc.getEvidencePackage(pkg.id));
});

test('lifecycle transitions use canTransition and publish events (KMOS-0202 §19)', async () => {
  const events: StoredEvent[] = [];
  const svc = new AssetRegistryService({ now: fixedNow });
  svc.eventBus.subscribe({ subscriber: 'spy', eventTypes: ['*'], handler: (s) => void events.push(s) });

  const asset = await svc.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: 'lc',
    storageRef: ref('lc/1'),
    checksum: sha256('lc'),
    content: bytes('lc'),
    provenance: { origin: 'Ingested' },
  });
  assert.equal(asset.lifecycle, 'Created');

  await svc.transitionLifecycle(asset.id, 'Validated');
  await svc.transitionLifecycle(asset.id, 'Approved');
  const archived = await svc.archiveAsset(asset.id);
  assert.equal(archived.lifecycle, 'Archived');
  assert.ok(events.some((e) => e.event.identity.type === 'AssetArchived'));

  // Restore: Archived -> Active is allowed by the canonical lifecycle.
  const restored = await svc.transitionLifecycle(asset.id, 'Active');
  assert.equal(restored.lifecycle, 'Active');
  assert.ok(events.some((e) => e.event.identity.type === 'AssetRestored'));

  // Illegal transition is rejected (Created -> Published is not allowed).
  const fresh = await svc.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: 'lc2',
    storageRef: ref('lc/2'),
    checksum: sha256('lc2'),
    content: bytes('lc2'),
    provenance: { origin: 'Ingested' },
  });
  await assert.rejects(() => svc.transitionLifecycle(fresh.id, 'Published'), /Illegal lifecycle transition/);
});

test('read-model recovery: a fresh service rebuilds asset/versions/provenance/lineage/evidence from the durable log', async () => {
  const bus = new EventBus();

  // s1 performs a representative sequence of writes on a shared bus.
  const s1 = new AssetRegistryService({ now: fixedNow, bus });

  const source = await s1.registerAsset({
    assetType: 'Video',
    mediaType: 'video/mp4',
    displayName: 'source',
    storageRef: ref('r/src'),
    checksum: sha256('src'),
    content: bytes('src'),
    provenance: { origin: 'Ingested' },
  });
  const derived = await s1.registerAsset({
    assetType: 'Transcript',
    mediaType: 'text/plain',
    displayName: 'derived',
    storageRef: ref('r/d1'),
    checksum: sha256('d1'),
    content: bytes('d1'),
    provenance: {
      origin: 'DerivedByCapability',
      sourceAssetIds: [source.id],
      producingCapabilityId: 'kmos:Capability:dddddddd-dddd-dddd-dddd-dddddddddddd',
    },
  });
  // A new immutable version (version chain depth > 1).
  await s1.createVersion(derived.id, {
    reason: 'fix',
    checksum: sha256('d2'),
    storageRef: ref('r/d2'),
    content: bytes('d2'),
  });
  // Metadata + storage + integrity + lifecycle + evidence exercise every repo.
  await s1.updateMetadata(derived.id, { description: 'a transcript', tags: ['x'] });
  await s1.updateStorageReference(derived.id, ref('r/d2b'));
  await s1.verifyIntegrity(derived.id);
  await s1.archiveAsset(derived.id);
  const pkg = await s1.generateEvidencePackage(derived.id);

  // A fresh service on the SAME bus starts empty until it hydrates.
  const s2 = new AssetRegistryService({ now: fixedNow, bus });
  assert.throws(() => s2.getAsset(derived.id), /not found/, 'empty before hydrate');
  assert.equal(s2.getEvidencePackage(pkg.id), undefined, 'empty before hydrate');

  await s2.hydrate();

  // Object retrieval is deep-equal to the original.
  assert.deepEqual(s2.getAsset(derived.id), s1.getAsset(derived.id));
  assert.deepEqual(s2.getAsset(source.id), s1.getAsset(source.id));
  assert.deepEqual(s2.getProvenance(derived.id), s1.getProvenance(derived.id));

  // Version history depth + contents recover identically.
  assert.equal(s2.getVersionHistory(derived.id).length, 2);
  assert.deepEqual(s2.getVersionHistory(derived.id), s1.getVersionHistory(derived.id));

  // Lineage (derived + source parent edges) recovers.
  assert.deepEqual(s2.getLineage(derived.id), s1.getLineage(derived.id));
  assert.deepEqual(s2.getLineage(source.id), s1.getLineage(source.id));

  // Evidence package recovers.
  assert.deepEqual(s2.getEvidencePackage(pkg.id), s1.getEvidencePackage(pkg.id));
});

test('AssetRegistered event is published on registration and validated by the bus catalog', async () => {
  const events: StoredEvent[] = [];
  const svc = new AssetRegistryService({ now: fixedNow });
  svc.eventBus.subscribe({ subscriber: 'spy', eventTypes: ['AssetRegistered', 'StorageMigrated'], handler: (s) => void events.push(s) });

  const asset = await svc.registerAsset({
    assetType: 'Audio',
    mediaType: 'audio/mpeg',
    displayName: 'song',
    storageRef: ref('a/1'),
    checksum: sha256('a'),
    content: bytes('a'),
    provenance: { origin: 'Ingested' },
  });
  await svc.updateStorageReference(asset.id, ref('a/2'));

  assert.equal(events.filter((e) => e.event.identity.type === 'AssetRegistered').length, 1);
  // StorageMigrated is an extra type registered on a LOCAL catalog (not the kernel seed).
  assert.equal(events.filter((e) => e.event.identity.type === 'StorageMigrated').length, 1);
});
