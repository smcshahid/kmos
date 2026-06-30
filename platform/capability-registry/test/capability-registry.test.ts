import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCycle } from '../src/index.js';
import { CapabilityRegistryService } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';
const contract = { acceptedObjects: ['Asset'], producedObjects: ['Transcript'], consumedEvents: ['AssetRegistered'], publishedEvents: ['TranscriptGenerated'] };

test('register capability + manifest + contract, discoverable (KMOS-0205)', async () => {
  const reg = new CapabilityRegistryService({ now: fixedNow });
  const cap = await reg.registerCapability({ name: 'SpeechRecognition', ownerDomain: 'Language', businessPurpose: 'Transcribe audio', version: '1.0.0', inputs: ['Asset'], outputs: ['Transcript'], contract });
  assert.equal(cap.type, 'Capability');
  assert.equal(reg.getManifest(cap.id)?.body.version, '1.0.0');
  assert.deepEqual(reg.getContract(cap.id)?.producedObjects, ['Transcript']);
  const found = reg.discover({ ownerDomain: 'Language', input: 'Asset', consumesEvent: 'AssetRegistered' });
  assert.equal(found.length, 1);
});

test('immutable versioning + currentVersion advances (KMOS-0205)', async () => {
  const reg = new CapabilityRegistryService({ now: fixedNow });
  const cap = await reg.registerCapability({ name: 'Translate', ownerDomain: 'Language', businessPurpose: 'x', version: '1.0.0', contract });
  await reg.registerVersion(cap.id, { version: '1.1.0', contract });
  assert.deepEqual(reg.getVersions(cap.id), ['1.0.0', '1.1.0']);
  assert.equal(reg.getCapability(cap.id)?.body.currentVersion, '1.1.0');
  await assert.rejects(() => reg.registerVersion(cap.id, { version: '1.1.0', contract }), /already registered/);
});

test('certification grants level + history + discovery filter (KMOS-0205)', async () => {
  const reg = new CapabilityRegistryService({ now: fixedNow });
  const cap = await reg.registerCapability({ name: 'Render', ownerDomain: 'Media', businessPurpose: 'x', version: '1.0.0', contract });
  await reg.certify(cap.id, '1.0.0', 'Production', 'governance');
  assert.equal(reg.getCapability(cap.id)?.body.certification, 'Production');
  assert.equal(reg.getCertificationHistory(cap.id).length, 1);
  assert.equal(reg.discover({ minCertification: 'Enterprise' }).length, 0);
  assert.equal(reg.discover({ minCertification: 'Verified' }).length, 1);
});

test('dependency graph: transitive deps + circular dependency rejected (KMOS-0205)', async () => {
  const reg = new CapabilityRegistryService({ now: fixedNow });
  const a = await reg.registerCapability({ name: 'A', ownerDomain: 'D', businessPurpose: 'x', version: '1.0.0', contract });
  const b = await reg.registerCapability({ name: 'B', ownerDomain: 'D', businessPurpose: 'x', version: '1.0.0', contract, dependencies: [a.id] });
  const c = await reg.registerCapability({ name: 'C', ownerDomain: 'D', businessPurpose: 'x', version: '1.0.0', contract, dependencies: [b.id] });
  assert.deepEqual(reg.getDependencies(c.id).direct, [b.id]);
  assert.equal(reg.getDependencies(c.id).transitive.includes(a.id), true);
  // Make A depend on C -> cycle A->C->B->A : must be rejected
  await assert.rejects(() => reg.registerVersion(a.id, { version: '1.1.0', contract, dependencies: [c.id] }), /[Cc]ircular/);
});

test('unknown dependency rejected', async () => {
  const reg = new CapabilityRegistryService({ now: fixedNow });
  await assert.rejects(
    () => reg.registerCapability({ name: 'X', ownerDomain: 'D', businessPurpose: 'x', version: '1.0.0', contract, dependencies: ['kmos:Capability:00000000-0000-4000-8000-000000000000'] }),
    /Unknown dependency/,
  );
});

test('findCycle helper detects a simple cycle', () => {
  const edges = new Map([['a', ['b']], ['b', ['a']]]);
  assert.ok(findCycle(edges));
  assert.equal(findCycle(new Map([['a', ['b']], ['b', []]])), undefined);
});
