import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventBus, type StoredEvent } from '@kmos/canonical-kernel';
import { AssetRegistryService } from '@kmos/assets';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { PreservationDomainService } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** sha256 hex of a UTF-8 string — matches the Asset Registry's Sha256ChecksumAdapter. */
function sha256(text: string): string {
  return createHash('sha256').update(new TextEncoder().encode(text)).digest('hex');
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Wire the Asset Registry + Preservation domain on one shared bus + catalog. */
function wire() {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const assets = new AssetRegistryService({ bus, now: fixedNow });
  const preservation = new PreservationDomainService({ bus, assets, now: fixedNow });
  return { bus, assets, preservation };
}

/** Register a sound asset whose stored bytes hash to its recorded checksum. */
async function registerSound(assets: AssetRegistryService, storageId: string, content: string) {
  return assets.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: storageId,
    storageRef: { storageId, backend: 'object' },
    checksum: sha256(content),
    content: bytes(content),
    provenance: { origin: 'Ingested' },
  });
}

test('Preservation: verifies integrity, builds evidence, reaches Preserved, emits PreservationCompleted', async () => {
  const { bus, assets, preservation } = wire();

  // Register a source asset and a derived asset (lineage source -> derived).
  const source = await registerSound(assets, 'kmos:store:source', 'source-bytes');
  const derived = await assets.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: 'derived',
    storageRef: { storageId: 'kmos:store:derived', backend: 'object' },
    checksum: sha256('derived-bytes'),
    content: bytes('derived-bytes'),
    provenance: { origin: 'DerivedByCapability', sourceAssetIds: [source.id] },
  });

  const res = await preservation.preserve({ assetIds: [source.id, derived.id] });

  // Integrity verified for both.
  assert.equal(res.integrity.length, 2);
  assert.ok(res.integrity.every((r) => r.ok));

  // Evidence packages created (one per asset).
  assert.equal(res.evidencePackageIds.length, 2);
  assert.ok(res.evidencePackageIds.every((id) => id.startsWith('kmos:EvidencePackage:')));

  // Both assets reach the canonical Preserved lifecycle state.
  assert.deepEqual([...res.preservedAssetIds].sort(), [source.id, derived.id].sort());
  assert.equal(assets.getAsset(source.id).lifecycle, 'Preserved');
  assert.equal(assets.getAsset(derived.id).lifecycle, 'Preserved');
  assert.equal(res.failedAssetIds.length, 0);

  // PreservationCompleted emitted on the shared bus for each preserved asset.
  const types = bus.eventLog.read(1).map((s: StoredEvent) => s.event.identity.type);
  const completed = types.filter((t) => t === 'PreservationCompleted');
  assert.equal(completed.length, 2);
});

test('Preservation: an asset whose bytes are tampered is reported as integrity failure and NOT preserved', async () => {
  const { bus, assets, preservation } = wire();

  const sound = await registerSound(assets, 'kmos:store:sound', 'sound-bytes');

  // Tampered: stored bytes do not hash to the recorded checksum (checksum mismatch).
  const tampered = await assets.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: 'tampered',
    storageRef: { storageId: 'kmos:store:tampered', backend: 'object' },
    checksum: sha256('the-original-bytes'),     // recorded checksum
    content: bytes('TAMPERED-DIFFERENT-BYTES'), // actual stored bytes differ
    provenance: { origin: 'Ingested' },
  });

  const res = await preservation.preserve({ assetIds: [sound.id, tampered.id] });

  // The tampered asset is surfaced as a failure, the sound one preserved.
  assert.deepEqual(res.failedAssetIds, [tampered.id]);
  assert.deepEqual(res.preservedAssetIds, [sound.id]);

  const tamperedSummary = res.assets.find((a) => a.assetId === tampered.id);
  assert.ok(tamperedSummary);
  assert.equal(tamperedSummary.integrity.ok, false);
  assert.equal(tamperedSummary.preserved, false);
  assert.notEqual(tamperedSummary.lifecycle, 'Preserved');
  assert.equal(tamperedSummary.evidencePackageId, undefined);

  // The tampered asset never reached Preserved in the registry.
  assert.notEqual(assets.getAsset(tampered.id).lifecycle, 'Preserved');
  assert.equal(assets.getAsset(sound.id).lifecycle, 'Preserved');

  // An IntegrityFailed event was published and PreservationCompleted was NOT
  // emitted for the tampered asset.
  const events = bus.eventLog.read(1);
  assert.ok(events.some((s) => s.event.identity.type === 'IntegrityFailed'));
  const completedForTampered = events.filter(
    (s) => s.event.identity.type === 'PreservationCompleted' && s.event.identity.subjectId === tampered.id,
  );
  assert.equal(completedForTampered.length, 0);
});

test('Preservation summary includes reconstructed lineage (reproducibility, KMOS-0006 §18)', async () => {
  const { assets, preservation } = wire();

  const source = await registerSound(assets, 'kmos:store:lin-source', 'lin-source');
  const derived = await assets.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: 'lin-derived',
    storageRef: { storageId: 'kmos:store:lin-derived', backend: 'object' },
    checksum: sha256('lin-derived'),
    content: bytes('lin-derived'),
    provenance: { origin: 'DerivedByCapability', sourceAssetIds: [source.id] },
  });

  const res = await preservation.preserve({ assetIds: [source.id, derived.id] });

  // The derived asset's summary carries lineage referencing its ancestor.
  const derivedSummary = res.assets.find((a) => a.assetId === derived.id);
  assert.ok(derivedSummary);
  assert.ok(derivedSummary.lineage.ancestors.includes(source.id));
  // The source asset's summary carries lineage referencing its descendant.
  const sourceSummary = res.assets.find((a) => a.assetId === source.id);
  assert.ok(sourceSummary);
  assert.ok(sourceSummary.lineage.descendants.includes(derived.id));
});
