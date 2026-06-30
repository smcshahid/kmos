import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEvent, newCanonicalId, type Projection, type StoredEvent } from '@kmos/canonical-kernel';
import { EventService, checkBackwardCompatible } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

test('Event Service: publish, history, correlation and causation chains (KMOS-0203 §15/§16)', async () => {
  const svc = new EventService({ now: fixedNow });
  const assetId = newCanonicalId('Asset');

  const e1 = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId: assetId, payload: { assetId } });
  await svc.publishEvent({ event: e1, streamId: assetId });
  const e2 = createEvent({ type: 'TranscriptGenerated', schemaVersion: '1.0', producer: 'capability:speech', subjectId: assetId, payload: { assetId }, causedBy: e1 });
  await svc.publishEvent({ event: e2, streamId: assetId });
  const e3 = createEvent({ type: 'KnowledgeUpdated', schemaVersion: '1.0', producer: 'KnowledgeService', subjectId: assetId, payload: { assetId }, causedBy: e2 });
  await svc.publishEvent({ event: e3, streamId: assetId });

  assert.equal((await svc.getEventHistory(assetId)).length, 3);
  assert.equal((await svc.getEvent(e2.identity.eventId))?.event.identity.type, 'TranscriptGenerated');

  const corr = await svc.getCorrelationChain(e1.identity.correlationId);
  assert.equal(corr.length, 3);

  const causation = await svc.getCausationChain(e3.identity.eventId);
  assert.deepEqual(causation.map((s) => s.event.identity.type), ['AssetRegistered', 'TranscriptGenerated', 'KnowledgeUpdated']);
});

test('Event Service: schema registry enforces BACKWARD compatibility (KMOS-0203 §12)', async () => {
  const svc = new EventService({ now: fixedNow });
  await svc.registerEventSchema({
    eventType: 'AssetRegistered',
    version: '1.0',
    schema: { type: 'object', required: ['assetId'], properties: { assetId: { type: 'string' } } },
  });
  // Backward-compatible: add optional field -> OK
  await svc.registerEventSchema({
    eventType: 'AssetRegistered',
    version: '1.1',
    schema: { type: 'object', required: ['assetId'], properties: { assetId: { type: 'string' }, mediaType: { type: 'string' } } },
  });
  // Breaking: add a new required field -> rejected
  await assert.rejects(() =>
    svc.registerEventSchema({
      eventType: 'AssetRegistered',
      version: '2.0',
      schema: { type: 'object', required: ['assetId', 'mediaType'], properties: { assetId: { type: 'string' }, mediaType: { type: 'string' } } },
    }),
  /not BACKWARD compatible/);
});

test('Event Service: validateEvent checks registered payload schema', async () => {
  const svc = new EventService({ now: fixedNow });
  await svc.registerEventSchema({
    eventType: 'AssetRegistered',
    version: '1.0',
    schema: { type: 'object', required: ['assetId'], properties: { assetId: { type: 'string', format: 'canonical-id' } } },
  });
  const good = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: { assetId: newCanonicalId('Asset') } });
  assert.doesNotThrow(() => svc.validateEvent(good));
  const bad = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: { wrong: 1 } });
  assert.throws(() => svc.validateEvent(bad), /Payload failed schema/);
});

test('Event Service: subscriptions deliver, pause, and resume (KMOS-0203 §17)', async () => {
  const svc = new EventService({ now: fixedNow });
  const received: string[] = [];
  await svc.createSubscription('projector', ['AssetRegistered'], (s: StoredEvent) => {
    received.push(s.event.identity.eventId);
  });

  const a = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: {} });
  await svc.publishEvent({ event: a });
  assert.equal(received.length, 1);

  svc.pauseSubscription('projector');
  const b = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: {} });
  await svc.publishEvent({ event: b });
  assert.equal(received.length, 1, 'paused subscription should not receive');

  svc.resumeSubscription('projector');
  const c = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: {} });
  await svc.publishEvent({ event: c });
  assert.equal(received.length, 2, 'resumed subscription receives new events');
});

test('Event Service: replay rebuilds a projection and emits replay lifecycle events (KMOS-0203 §14)', async () => {
  const svc = new EventService({ now: fixedNow });
  const id = newCanonicalId('Asset');
  await svc.publishEvent({ event: createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId: id, payload: {} }), streamId: id });
  await svc.publishEvent({ event: createEvent({ type: 'AssetUpdated', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId: id, payload: {} }), streamId: id });

  const countByType: Projection<Record<string, number>> = {
    name: 'count-by-type',
    initial: () => ({}),
    apply: (state, s) => ({ ...state, [s.event.identity.type]: (state[s.event.identity.type] ?? 0) + 1 }),
  };
  const { state, session } = await svc.replayEvents(countByType);
  assert.equal(state['AssetRegistered'], 1);
  assert.equal(state['AssetUpdated'], 1);
  assert.equal(session.projection, 'count-by-type');

  // ReplayStarted + ReplayCompleted were emitted into the log
  const metrics = await svc.getEventMetrics();
  assert.ok(metrics.byType['ReplayStarted'] >= 1);
  assert.ok(metrics.byType['ReplayCompleted'] >= 1);
});

test('compatibility helper: detects type changes', () => {
  const res = checkBackwardCompatible(
    { type: 'object', properties: { n: { type: 'string' } } },
    { type: 'object', properties: { n: { type: 'number' } } },
  );
  assert.equal(res.compatible, false);
  assert.match(res.reasons[0]!, /changed type/);
});
