import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type StoredEvent } from '@kmos/canonical-kernel';
import { AssetRegistryService } from '@kmos/assets';
import { IdentityService } from '@kmos/identity';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import {
  ConnectorHost,
  WebPageConnector,
  type ExternalRecord,
} from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** Wire the host on a single shared bus, exactly as a composed deployment would. */
function wire() {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const assets = new AssetRegistryService({ bus, now: fixedNow });
  const identity = new IdentityService({ bus, now: fixedNow });
  const host = new ConnectorHost({ bus, assets, identity, now: fixedNow });
  return { bus, assets, identity, host };
}

const sampleRecord: ExternalRecord = {
  uri: 'https://example.org/articles/kmos-intro',
  contentType: 'text/html',
  bytesOrText: '<html><body>Hello, KMOS.</body></html>',
  checksum: 'sha256:web-1',
  displayName: 'KMOS Intro',
};

async function typesOf(bus: EventBus): Promise<Set<string>> {
  return new Set((await bus.eventLog.read(1)).map((s: StoredEvent) => s.event.identity.type));
}

test('registering + activating a connector mints a canonical Connector identity and emits ConnectorActivated', async () => {
  const { bus, identity, host } = wire();
  const entry = await host.registerAndActivate(new WebPageConnector());

  // The connector has a canonical identity of kind 'Connector' (governed, not anonymous).
  const id = identity.getIdentity(entry.identityId);
  assert.ok(id, 'connector identity exists in the Identity Service');
  assert.equal(id.body.kind, 'Connector');
  assert.equal(id.owner, 'IdentityService');
  assert.equal(id.displayName, 'web-page');
  assert.equal(entry.activated, true);

  // ConnectorActivated landed on the shared bus, attributed to the connector identity.
  const types = await typesOf(bus);
  assert.ok(types.has('ConnectorActivated'), 'ConnectorActivated was published');
  const activated = (await bus.eventLog.read(1)).find((s) => s.event.identity.type === 'ConnectorActivated');
  assert.ok(activated);
  assert.equal(activated.event.identity.actorId, entry.identityId);
  assert.equal((activated.event.payload as { connectorName?: string }).connectorName, 'web-page');
});

test('ingesting an external record registers a canonical Asset with external+connector provenance and emits ExternalRecordIngested', async () => {
  const { bus, assets, host } = wire();
  const entry = await host.registerAndActivate(new WebPageConnector());

  const result = await host.ingest('web-page', sampleRecord);

  // A canonical Asset id was produced.
  assert.ok(result.assetId.startsWith('kmos:Asset:'), 'canonical Asset id');
  assert.equal(result.connectorIdentityId, entry.identityId);
  assert.equal(result.externalSource, sampleRecord.uri);

  // Provenance references BOTH the external source and the connector identity.
  const prov = assets.getProvenance(result.assetId);
  assert.equal(prov.body.origin, 'IngestedByConnector');
  assert.equal(prov.body.originalSource, sampleRecord.uri);
  assert.ok(
    prov.body.contributors.some((c) => c.id === entry.identityId && c.role === 'Connector'),
    'connector identity recorded as a provenance contributor',
  );

  // The translation classified the HTML record as a Document asset.
  const asset = assets.getAsset(result.assetId);
  assert.equal(asset.body.assetType, 'Document');
  assert.equal(asset.body.media.mediaType, 'text/html');

  // ExternalRecordIngested landed on the shared bus with provenance in its payload.
  const types = await typesOf(bus);
  assert.ok(types.has('ExternalRecordIngested'), 'ExternalRecordIngested was published');
  const ingested = (await bus.eventLog.read(1)).find((s) => s.event.identity.type === 'ExternalRecordIngested');
  assert.ok(ingested);
  const payload = ingested.event.payload as {
    assetId?: string;
    externalSource?: string;
    connectorIdentityId?: string;
  };
  assert.equal(payload.assetId, result.assetId);
  assert.equal(payload.externalSource, sampleRecord.uri);
  assert.equal(payload.connectorIdentityId, entry.identityId);
});

test('the connector never bypasses the Asset Registry: the asset exists in the registry afterward', async () => {
  const { bus, assets, host } = wire();
  await host.registerAndActivate(new WebPageConnector());
  const result = await host.ingest('web-page', sampleRecord);

  // The only path to an asset is through the registry; getAsset must resolve it.
  const asset = assets.getAsset(result.assetId);
  assert.ok(asset, 'asset is in the registry');
  assert.equal(asset.id, result.assetId);
  // AssetRegistered (the registry's own canonical event) was emitted — proof the
  // host went through the registry rather than fabricating an asset.
  assert.ok((await typesOf(bus)).has('AssetRegistered'));
});

test('a connector is a governed actor: it cannot ingest before activation, and identity is never anonymous', async () => {
  const { identity, host } = wire();
  const entry = await host.registerConnector(new WebPageConnector());

  // Registered but not yet activated -> ingestion is refused.
  await assert.rejects(() => host.ingest('web-page', sampleRecord), /activated/i);

  // Even before activation the connector already has a non-anonymous canonical identity.
  const id = identity.getIdentity(entry.identityId);
  assert.ok(id);
  assert.equal(id.body.kind, 'Connector');
  assert.notEqual(id.displayName.trim(), '');

  // Ingesting through an unregistered connector name is refused too.
  await assert.rejects(() => host.ingest('unknown', sampleRecord), /not registered/i);
});

test('ingestion is deterministic: identical input yields identical canonical translation', async () => {
  const a = wire();
  await a.host.registerAndActivate(new WebPageConnector());
  const r1 = await a.host.ingest('web-page', sampleRecord);
  const asset1 = a.assets.getAsset(r1.assetId);

  const b = wire();
  await b.host.registerAndActivate(new WebPageConnector());
  const r2 = await b.host.ingest('web-page', sampleRecord);
  const asset2 = b.assets.getAsset(r2.assetId);

  // Storage id, type and checksum are a pure function of the external record.
  assert.equal(asset1.body.currentStorage.storageId, asset2.body.currentStorage.storageId);
  assert.equal(asset1.body.assetType, asset2.body.assetType);
  assert.equal(asset1.body.currentStorage.storageId, `web:${sampleRecord.uri}`);
});
