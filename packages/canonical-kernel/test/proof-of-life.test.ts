/**
 * M0 Proof of Life (Readiness Report §10.1 exit criterion).
 *
 * Demonstrates the canonical event round-trip end to end, in-process:
 *   publish -> validate -> append-only log -> idempotent consume -> replay
 * plus correlation/causation chaining and rejection of unregistered events.
 *
 * This is the architectural heartbeat the whole platform is built on.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventBus,
  createEvent,
  newCanonicalId,
  replay,
  type Projection,
  type StoredEvent,
} from '../src/index.js';

test('proof of life: publish -> validate -> persist -> consume idempotently -> replay', async () => {
  const bus = new EventBus();
  const assetId = newCanonicalId('Asset');

  const seenTypes: string[] = [];
  let invocations = 0;
  bus.subscribe({
    subscriber: 'knowledge-projection',
    eventTypes: ['*'],
    handler: (stored: StoredEvent) => {
      invocations += 1;
      seenTypes.push(stored.event.identity.type);
    },
  });

  // Correlated business chain: AssetRegistered -> TranscriptGenerated -> KnowledgeUpdated
  const registered = createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    subjectId: assetId,
    payload: { assetId, mediaType: 'audio/wav' },
  });
  const s1 = await bus.publish(registered, { streamId: assetId });

  const transcript = createEvent({
    type: 'TranscriptGenerated',
    schemaVersion: '1.0',
    producer: 'capability:speech-recognition',
    subjectId: assetId,
    payload: { assetId, transcriptId: newCanonicalId('Asset') },
    causedBy: registered,
  });
  await bus.publish(transcript, { streamId: assetId });

  const knowledge = createEvent({
    type: 'KnowledgeUpdated',
    schemaVersion: '1.0',
    producer: 'KnowledgeService',
    subjectId: assetId,
    payload: { assetId, knowledgeId: newCanonicalId('KnowledgeObject') },
    causedBy: transcript,
  });
  await bus.publish(knowledge, { streamId: assetId });

  // Append-only log
  assert.equal(bus.eventLog.size(), 3);
  assert.equal(bus.eventLog.currentVersion(assetId), 3);
  const stream = bus.eventLog.readStream(assetId);
  assert.deepEqual(stream.map((s) => s.streamVersion), [1, 2, 3]);
  assert.deepEqual(stream.map((s) => s.sequence), [1, 2, 3]);

  // Correlation/causation chained across the whole transaction
  const corr = registered.identity.correlationId;
  assert.equal(transcript.identity.correlationId, corr);
  assert.equal(knowledge.identity.correlationId, corr);
  assert.equal(knowledge.identity.causationId, transcript.identity.eventId);

  // Consumer received all three exactly once
  assert.equal(invocations, 3);
  assert.deepEqual(seenTypes, ['AssetRegistered', 'TranscriptGenerated', 'KnowledgeUpdated']);

  // Idempotency: redelivering a stored event does NOT re-invoke
  await bus.redeliver(s1);
  assert.equal(invocations, 3);
  assert.equal(bus.hasProcessed('knowledge-projection', registered.identity.eventId), true);

  // Replay: rebuild a projection from the immutable log
  const countByType: Projection<Record<string, number>> = {
    name: 'count-by-type',
    initial: () => ({}),
    apply: (state, stored) => {
      const t = stored.event.identity.type;
      return { ...state, [t]: (state[t] ?? 0) + 1 };
    },
  };
  const { state, session } = replay(bus.eventLog, countByType, { now: () => '2026-06-30T00:00:00.000Z' });
  assert.deepEqual(state, { AssetRegistered: 1, TranscriptGenerated: 1, KnowledgeUpdated: 1 });
  assert.equal(session.eventsApplied, 3);
  assert.equal(session.fromSequence, 1);
  assert.equal(session.toSequence, 3);
  assert.equal(session.projection, 'count-by-type');
  assert.equal(bus.eventLog.size(), 3); // unchanged by replay
});

test('rejects an unregistered canonical event type before it enters history', async () => {
  const bus = new EventBus();
  const bogus = createEvent({ type: 'SomethingNeverRegistered', schemaVersion: '1.0', producer: 'test', payload: {} });
  await assert.rejects(() => bus.publish(bogus), /unregistered/i);
  assert.equal(bus.eventLog.size(), 0);
});

test('enforces optimistic concurrency on a stream', async () => {
  const bus = new EventBus();
  const id = newCanonicalId('Asset');
  const e1 = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId: id, payload: {} });
  await bus.publish(e1, { streamId: id, expectedVersion: 0 });
  const e2 = createEvent({ type: 'AssetUpdated', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId: id, payload: {} });
  await assert.rejects(() => bus.publish(e2, { streamId: id, expectedVersion: 0 }), /conflict/i);
});
