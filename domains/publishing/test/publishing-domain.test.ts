import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type StoredEvent } from '@kmos/canonical-kernel';
import { AssetRegistryService } from '@kmos/assets';
import { GovernanceService } from '@kmos/governance';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { PublishingDomainService } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

function wire() {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const assets = new AssetRegistryService({ bus, now: fixedNow });
  const governance = new GovernanceService({ bus, now: fixedNow });
  const registry = new CapabilityRegistryService({ bus, now: fixedNow });
  const runtime = new CapabilityRuntimeService({ bus, now: fixedNow });
  const publishing = new PublishingDomainService({ bus, assets, governance, registry, runtime, now: fixedNow });
  return { bus, assets, governance, registry, runtime, publishing };
}

function eventTypes(bus: EventBus): Set<string> {
  return new Set(bus.eventLog.read(1).map((s: StoredEvent) => s.event.identity.type));
}

test('Publishing happy path: capability metadata -> Publication asset w/ lineage -> approval granted -> PublicationReleased', async () => {
  const { bus, assets, governance, publishing } = wire();

  const source = await assets.registerAsset({
    assetType: 'Document', mediaType: 'text/plain', displayName: 'Source doc',
    storageRef: { storageId: 'kmos:src:1', backend: 'object' }, checksum: 'sha256:src',
    provenance: { origin: 'Ingested' },
  });

  const res = await publishing.publish({
    title: 'The Open Knowledge Manifesto',
    knowledgeIds: ['kmos:Knowledge:k1'],
    assetIds: [source.id],
    approver: 'editor@kmos',
  });

  // Released only after approval.
  assert.equal(res.released, true);
  assert.ok(res.publicationAssetId.startsWith('kmos:Asset:'));
  assert.equal(res.state, 'Completed');

  // Metadata came from the capability (deterministic slug + summary referencing counts).
  assert.equal(res.metadata.title, 'The Open Knowledge Manifesto');
  assert.equal(res.metadata.slug, 'the-open-knowledge-manifesto');
  assert.match(res.metadata.summary, /1 knowledge item\(s\) and 1 asset\(s\)/);
  assert.ok(res.metadata.tags.includes('knowledge'));

  // Publication asset exists and is of type Publication.
  const pub = assets.getAsset(res.publicationAssetId);
  assert.equal(pub.body.assetType, 'Publication');

  // Lineage: the publication derives from the source asset.
  const lineage = assets.getLineage(res.publicationAssetId);
  assert.ok(lineage.ancestors.includes(source.id));

  // The approval was granted by the approver.
  const approval = governance.getApproval(res.approvalId);
  assert.ok(approval);
  assert.equal(approval?.body.state, 'Granted');

  // Events on the shared bus.
  const types = eventTypes(bus);
  assert.ok(types.has('AssetRegistered'));
  assert.ok(types.has('CapabilityExecutionCompleted')); // runtime executed the metadata capability
  assert.ok(types.has('PublicationMetadataGenerated'));
  assert.ok(types.has('ApprovalRequested'));
  assert.ok(types.has('ApprovalGranted'));
  assert.ok(types.has('PublicationReleased'));
  assert.ok(types.has('PublicationPrepared'));
});

test('Publishing rejection path: governance gate blocks release, no PublicationReleased, released=false', async () => {
  const { bus, assets, governance, publishing } = wire();

  const source = await assets.registerAsset({
    assetType: 'Document', mediaType: 'text/plain', displayName: 'Source doc',
    storageRef: { storageId: 'kmos:src:2', backend: 'object' }, checksum: 'sha256:src2',
    provenance: { origin: 'Ingested' },
  });

  const res = await publishing.publishWithRejection({
    title: 'Rejected Draft',
    knowledgeIds: ['kmos:Knowledge:k2'],
    assetIds: [source.id],
    approver: 'editor@kmos',
  });

  // Gate enforced: not released.
  assert.equal(res.released, false);

  // The publication asset was still packaged (with lineage), but not released.
  const pub = assets.getAsset(res.publicationAssetId);
  assert.equal(pub.body.assetType, 'Publication');
  assert.ok(assets.getLineage(res.publicationAssetId).ancestors.includes(source.id));

  // Approval was rejected.
  const approval = governance.getApproval(res.approvalId);
  assert.equal(approval?.body.state, 'Rejected');

  // No release facts emitted.
  const types = eventTypes(bus);
  assert.ok(types.has('ApprovalRejected'));
  assert.ok(!types.has('PublicationReleased'));
  assert.ok(!types.has('PublicationPrepared'));
});

test('Publishing holds no business logic: metadata is produced only via the capability/runtime', async () => {
  const { bus, publishing } = wire();
  const res = await publishing.publish({
    title: 'Composition Over Inheritance',
    knowledgeIds: [],
    assetIds: [],
    approver: 'editor@kmos',
  });
  // The capability ran (its execution-completed event is present) and produced the metadata.
  assert.ok(eventTypes(bus).has('CapabilityExecutionCompleted'));
  assert.equal(res.metadata.slug, 'composition-over-inheritance');
  assert.ok(res.released);
});
