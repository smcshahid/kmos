import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newCanonicalId,
  parseCanonicalId,
  isCanonicalId,
  objectTypeOf,
  canTransition,
  isLifecycleState,
  KmosError,
  isRetryable,
  createCanonicalObject,
  createEvent,
  validate,
  EVENT_ENVELOPE_SCHEMA,
  CANONICAL_OBJECT_SCHEMA,
  EventCatalog,
  defaultEventCatalog,
} from '../src/index.js';

test('canonical identifiers: create, parse, reject non-canonical (KMOS-0100 §6)', () => {
  const id = newCanonicalId('Asset');
  assert.equal(isCanonicalId(id), true);
  assert.equal(objectTypeOf(id), 'Asset');
  assert.equal(parseCanonicalId(id)?.prefix, 'kmos');

  assert.equal(isCanonicalId('asset-123.mp4'), false);
  assert.equal(isCanonicalId('s3://bucket/key'), false);
  assert.equal(isCanonicalId('kmos:Asset:not-a-uuid'), false);
  assert.equal(parseCanonicalId('kmos:Asset'), undefined);

  assert.throws(() => newCanonicalId('Bad Type'));
  assert.throws(() => newCanonicalId('123'));
});

test('canonical lifecycle transitions (KMOS-0100 §7)', () => {
  assert.equal(canTransition('Created', 'Validated'), true);
  assert.equal(canTransition('Approved', 'Published'), true);
  assert.equal(canTransition('Retired', 'Active'), false);
  assert.equal(canTransition('Published', 'Created'), false);
  assert.equal(isLifecycleState('Approved'), true);
  assert.equal(isLifecycleState('Nonsense'), false);
});

test('error taxonomy: retryable classification (KMOS-0120 §18)', () => {
  const transient = new KmosError('boom', { category: 'Transient', code: 'x.transient' });
  const validation = new KmosError('bad', { category: 'Validation', code: 'x.bad' });
  assert.equal(transient.retryable, true);
  assert.equal(isRetryable(transient), true);
  assert.equal(validation.retryable, false);
  assert.equal(isRetryable(validation), false);
});

test('canonical object common structure passes the common schema (KMOS-0100 §5)', () => {
  const obj = createCanonicalObject({
    id: newCanonicalId('Asset'),
    type: 'Asset',
    schemaVersion: '1.0',
    owner: 'AssetRegistry',
    body: { mediaType: 'audio/wav', checksum: 'sha256:abc' },
    now: '2026-06-30T00:00:00.000Z',
  });
  assert.equal(obj.version, 1);
  assert.equal(obj.lifecycle, 'Created');
  assert.equal(validate(CANONICAL_OBJECT_SCHEMA, obj).valid, true);

  const bad = validate(CANONICAL_OBJECT_SCHEMA, { id: 'kmos:Asset:bad', type: 'Asset' });
  assert.equal(bad.valid, false);
  assert.ok(bad.issues.length > 0);
});

test('event envelope correlation/causation rules (KMOS-0110 §5)', () => {
  const root = createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    payload: { assetId: newCanonicalId('Asset') },
  });
  assert.equal(root.identity.correlationId, root.identity.eventId);
  assert.equal(root.identity.causationId, undefined);

  const child = createEvent({
    type: 'TranscriptGenerated',
    schemaVersion: '1.0',
    producer: 'capability:speech',
    payload: { transcriptId: newCanonicalId('Asset') },
    causedBy: root,
  });
  assert.equal(child.identity.correlationId, root.identity.correlationId);
  assert.equal(child.identity.causationId, root.identity.eventId);
});

test('envelope schema validation accepts/rejects (KMOS-0110 §13)', () => {
  const ev = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: {} });
  assert.equal(validate(EVENT_ENVELOPE_SCHEMA, ev).valid, true);
  assert.equal(validate(EVENT_ENVELOPE_SCHEMA, { identity: {}, payload: {}, governance: {} }).valid, false);
});

test('event catalog contains proven families; rejects duplicates (KMOS-10040)', () => {
  assert.equal(defaultEventCatalog.has('AssetRegistered'), true);
  assert.equal(defaultEventCatalog.has('KnowledgeUpdated'), true);
  assert.equal(defaultEventCatalog.has('NonExistentEvent'), false);
  const c = new EventCatalog([]);
  c.register({ type: 'FooHappened', owner: 'EventService', eventClass: 'Platform', schemaVersion: '1.0', category: 'Test' });
  assert.throws(() =>
    c.register({ type: 'FooHappened', owner: 'EventService', eventClass: 'Platform', schemaVersion: '1.0', category: 'Test' }),
  );
});
