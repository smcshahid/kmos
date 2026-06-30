import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventBus } from '@kmos/canonical-kernel';
import { AssetRegistryService } from '@kmos/assets';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { ArchiveExplorer } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** sha256 hex of a UTF-8 string — matches the Asset Registry's Sha256ChecksumAdapter. */
function sha256(text: string): string {
  return createHash('sha256').update(new TextEncoder().encode(text)).digest('hex');
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Wire the Asset Registry + Archive Explorer on one shared bus + catalog. */
function wire() {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const assets = new AssetRegistryService({ bus, now: fixedNow });
  const explorer = new ArchiveExplorer({ assets });
  return { bus, assets, explorer };
}

/** Register an asset whose stored bytes hash to its recorded checksum. */
async function register(
  assets: AssetRegistryService,
  storageId: string,
  content: string,
  sourceAssetIds: readonly string[] = [],
) {
  return assets.registerAsset({
    assetType: 'Document',
    mediaType: 'text/plain',
    displayName: storageId,
    storageRef: { storageId, backend: 'object' },
    checksum: sha256(content),
    content: bytes(content),
    provenance: {
      origin: sourceAssetIds.length > 0 ? 'DerivedByCapability' : 'Ingested',
      ...(sourceAssetIds.length > 0 ? { sourceAssetIds } : {}),
    },
  });
}

test('Archive Explorer: getAssetView returns asset + provenance + version history (thin facade)', async () => {
  const { assets, explorer } = wire();
  const asset = await register(assets, 'kmos:store:doc', 'doc-bytes');

  const view = explorer.getAssetView(asset.id);
  assert.equal(view.asset.id, asset.id);
  assert.equal(view.provenance.body.assetId, asset.id);
  assert.equal(view.provenance.body.origin, 'Ingested');
  assert.equal(view.versionHistory.length, 1);
  assert.equal(view.versionHistory[0]!.body.ordinal, 1);
});

test('Archive Explorer: lineageView reconstructs the derivation (derived reaches its source)', async () => {
  const { assets, explorer } = wire();
  const source = await register(assets, 'kmos:store:source', 'source-bytes');
  const derived = await register(assets, 'kmos:store:derived', 'derived-bytes', [source.id]);
  // Also make the edge explicit, as in the asset registry / preservation tests.
  await assets.recordDerivation({ derivedAssetId: derived.id, inputAssetIds: [source.id] });

  const view = explorer.lineageView(derived.id);
  assert.equal(view.assetId, derived.id);
  assert.ok(view.ancestors.includes(source.id), 'derived asset reaches its source');
  assert.ok(view.edges.some((e) => e.derivedAssetId === derived.id && e.inputAssetIds.includes(source.id)));

  // From the source side, the derived asset is a descendant.
  const sourceView = explorer.lineageView(source.id);
  assert.ok(sourceView.descendants.includes(derived.id));
});

test('Archive Explorer: evidenceReview returns an integrity result (passes) + provenance + package', async () => {
  const { assets, explorer } = wire();
  const asset = await register(assets, 'kmos:store:evidence', 'evidence-bytes');

  const review = await explorer.evidenceReview(asset.id);
  assert.equal(review.integrity.assetId, asset.id);
  assert.equal(review.integrity.ok, true, 'integrity passes when bytes match the checksum');
  assert.equal(review.integrity.record.result, 'Verified');
  assert.equal(review.provenance.body.assetId, asset.id);
  assert.ok(review.evidencePackageId?.startsWith('kmos:EvidencePackage:'));

  // The bundled chain of custody is retrievable from the registry.
  const pkg = assets.getEvidencePackage(review.evidencePackageId!);
  assert.equal(pkg?.body.assetId, asset.id);

  // bundle: false skips package generation.
  const review2 = await explorer.evidenceReview(asset.id, { bundle: false });
  assert.equal(review2.evidencePackageId, undefined);
  assert.equal(review2.integrity.ok, true);
});

test('Archive Explorer: timeline lists versions in order', async () => {
  const { assets, explorer } = wire();
  const asset = await register(assets, 'kmos:store:timeline', 'v1-bytes');
  await assets.createVersion(asset.id, {
    reason: 'correction',
    checksum: sha256('v2-bytes'),
    storageRef: { storageId: 'kmos:store:timeline-v2', backend: 'object' },
    content: bytes('v2-bytes'),
  });

  const timeline = explorer.timeline(asset.id);
  assert.equal(timeline.length, 2);
  assert.equal(timeline[0]!.ordinal, 1);
  assert.equal(timeline[1]!.ordinal, 2);
  assert.equal(timeline[1]!.reason, 'correction');
  assert.equal(timeline[1]!.parentVersionId, timeline[0]!.versionId);
});
