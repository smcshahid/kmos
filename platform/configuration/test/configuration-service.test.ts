import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type StoredEvent } from '@kmos/canonical-kernel';
import {
  ConfigurationService,
  EchoSecretResolver,
  createConfigurationCatalog,
  isSecretReference,
  type SecretReference,
} from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** Build a service whose bus is wired to the local Configuration catalog. */
function makeService(extra: { secretResolver?: EchoSecretResolver } = {}) {
  const bus = new EventBus({ catalog: createConfigurationCatalog() });
  return new ConfigurationService({ bus, now: fixedNow, ...extra });
}

test('Config Service: registering a set emits ConfigurationRegistered (KMOS-0209 §4)', async () => {
  const bus = new EventBus({ catalog: createConfigurationCatalog() });
  const received: StoredEvent[] = [];
  bus.subscribe({ subscriber: 'probe', eventTypes: ['ConfigurationRegistered'], handler: (s) => { received.push(s); } });
  const svc = new ConfigurationService({ bus, now: fixedNow });

  const set = await svc.registerSet({ scope: 'service', namespace: 'asset-registry' });

  assert.equal(set.type, 'ConfigurationSet');
  assert.equal(set.owner, 'ConfigurationService');
  assert.equal(set.body.scope, 'service');
  assert.equal(set.body.namespace, 'asset-registry');
  assert.equal(received.length, 1);
  assert.equal(received[0]!.event.identity.type, 'ConfigurationRegistered');
  assert.equal(received[0]!.event.payload.setId, set.id);
});

test('Config Service: resolution precedence — profile override beats set default (KMOS-0209 §3)', async () => {
  const svc = makeService();
  const set = await svc.registerSet({ scope: 'platform', namespace: 'core' });

  await svc.setValues(set.id, { 'log.level': 'info', timeoutMs: 1000 }, { reason: 'defaults' });
  await svc.setValues(set.id, { 'log.level': 'debug' }, { reason: 'dev tuning', profile: 'dev' });

  // Default scope (no profile)
  assert.equal(await svc.resolve(set.id, 'log.level'), 'info');
  // Profile override beats default
  assert.equal(await svc.resolve(set.id, 'log.level', { profile: 'dev' }), 'debug');
  // Key not overridden falls back to the set default within a profile
  assert.equal(await svc.resolve(set.id, 'timeoutMs', { profile: 'dev' }), 1000);
  // Unknown key resolves to undefined
  assert.equal(await svc.resolve(set.id, 'missing'), undefined);
});

test('Config Service: immutable version history — old version readable after update (KMOS-0209 §3)', async () => {
  const svc = makeService();
  const set = await svc.registerSet({ scope: 'service', namespace: 'billing' });

  const v1 = await svc.setValues(set.id, { rate: 10 }, { reason: 'initial rate' });
  const v2 = await svc.setValues(set.id, { rate: 20 }, { reason: 'price increase' });

  // Distinct immutable versions, monotonic numbering, recorded reasons
  assert.notEqual(v1.id, v2.id);
  assert.equal(v1.body.versionNumber, 1);
  assert.equal(v2.body.versionNumber, 2);
  assert.equal(v1.body.reason, 'initial rate');
  assert.equal(v2.body.reason, 'price increase');

  // Old version is still readable and unchanged
  const reread = svc.getVersion(v1.id)!;
  assert.equal(reread.body.values.rate, 10);
  assert.equal(svc.getVersionHistory(set.id).length, 2);

  // The set resolves to the latest version
  assert.equal(await svc.resolve(set.id, 'rate'), 20);
});

test('Config Service: secret indirection — stored object holds only the reference; port returns the value (KMOS-0190)', async () => {
  const secrets = new EchoSecretResolver({ 'secret://vault/db/password': 's3cr3t-clear' });
  const svc = makeService({ secretResolver: secrets });
  const set = await svc.registerSet({ scope: 'service', namespace: 'db' });

  const ref: SecretReference = { secret: 'secret://vault/db/password' };
  const version = await svc.setValues(set.id, { password: ref }, { reason: 'wire secret ref' });

  // The clear secret is NEVER stored — only the reference is.
  const stored = version.body.values.password;
  assert.ok(isSecretReference(stored));
  assert.equal((stored as SecretReference).secret, 'secret://vault/db/password');
  assert.equal(JSON.stringify(version.body).includes('s3cr3t-clear'), false, 'clear secret must not be persisted');

  // Resolution goes through the port and returns the clear value.
  assert.equal(await svc.resolve(set.id, 'password'), 's3cr3t-clear');

  // An unresolvable reference is an error, not a silent clear leak.
  const set2 = await svc.registerSet({ scope: 'service', namespace: 'db2' });
  await svc.setValues(set2.id, { token: { secret: 'secret://vault/unknown' } }, { reason: 'dangling' });
  await assert.rejects(() => svc.resolve(set2.id, 'token'), /Unresolvable secret reference/);
});

test('Config Service: secret resolution emits SecretReferenced (KMOS-0209 §4)', async () => {
  const bus = new EventBus({ catalog: createConfigurationCatalog() });
  const secrets = new EchoSecretResolver({ 'secret://vault/api/key': 'abc123' });
  const referenced: StoredEvent[] = [];
  bus.subscribe({ subscriber: 'probe', eventTypes: ['SecretReferenced'], handler: (s) => { referenced.push(s); } });
  const svc = new ConfigurationService({ bus, secretResolver: secrets, now: fixedNow });

  const set = await svc.registerSet({ scope: 'capability', namespace: 'speech' });
  await svc.setValues(set.id, { apiKey: { secret: 'secret://vault/api/key' } }, { reason: 'add key' });
  await svc.resolve(set.id, 'apiKey');

  assert.equal(referenced.length, 1);
  assert.equal(referenced[0]!.event.payload.ref, 'secret://vault/api/key');
});

test('Config Service: profile change emits ConfigurationProfileChanged (KMOS-0209 §4)', async () => {
  const bus = new EventBus({ catalog: createConfigurationCatalog() });
  const received: StoredEvent[] = [];
  bus.subscribe({ subscriber: 'probe', eventTypes: ['ConfigurationProfileChanged'], handler: (s) => { received.push(s); } });
  const svc = new ConfigurationService({ bus, now: fixedNow });

  const set = await svc.registerSet({ scope: 'platform', namespace: 'core' });
  const profile = await svc.registerProfile(set.id, 'prod');

  assert.equal(profile.body.name, 'prod');
  assert.equal(received.length, 1);
  assert.equal(received[0]!.event.identity.type, 'ConfigurationProfileChanged');
  assert.equal(received[0]!.event.payload.profile, 'prod');
});

test('Config Service: ConfigurationUpdated published on setValues (KMOS-0209 §4)', async () => {
  const bus = new EventBus({ catalog: createConfigurationCatalog() });
  const received: StoredEvent[] = [];
  bus.subscribe({ subscriber: 'probe', eventTypes: ['ConfigurationUpdated'], handler: (s) => { received.push(s); } });
  const svc = new ConfigurationService({ bus, now: fixedNow });

  const set = await svc.registerSet({ scope: 'service', namespace: 'svc' });
  await svc.setValues(set.id, { a: 1 }, { reason: 'first' });

  assert.equal(received.length, 1);
  assert.equal(received[0]!.event.identity.type, 'ConfigurationUpdated');
  assert.equal(received[0]!.event.payload.reason, 'first');
});
