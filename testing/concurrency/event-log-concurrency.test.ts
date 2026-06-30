/**
 * Concurrency & ordering guarantees of the canonical event log (KMOS-0110 §11,
 * KMOS-0203). The in-process log is single-threaded but models the production
 * Postgres design: per-stream optimistic concurrency (UNIQUE(stream_id,version))
 * + a monotonic global sequence. These tests assert those invariants and
 * idempotent delivery under duplicate/concurrent dispatch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, InMemoryEventLog, createEvent, newCanonicalId } from '@kmos/canonical-kernel';

test('optimistic concurrency: a stale expectedVersion is rejected (lost-update prevented)', async () => {
  const log = new InMemoryEventLog();
  const stream = newCanonicalId('Asset');
  const e = () => createEvent({ type: 'AssetUpdated', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId: stream, payload: {} });
  await log.append(stream, e(), { expectedVersion: 0 }); // v1
  await log.append(stream, e(), { expectedVersion: 1 }); // v2
  // Two writers both read version 2 then try to write v3; the second loses.
  await log.append(stream, e(), { expectedVersion: 2 }); // v3 wins
  await assert.rejects(() => log.append(stream, e(), { expectedVersion: 2 }), /conflict/i);
  assert.equal(await log.currentVersion(stream), 3);
});

test('per-stream ordering + monotonic global sequence across interleaved streams', async () => {
  const bus = new EventBus();
  const a = newCanonicalId('Asset');
  const b = newCanonicalId('Asset');
  const mk = (s: string) => createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId: s, payload: {} });
  // Interleave publishes to two streams.
  await Promise.all([
    bus.publish(mk(a), { streamId: a }),
    bus.publish(mk(b), { streamId: b }),
    bus.publish(mk(a), { streamId: a }),
    bus.publish(mk(b), { streamId: b }),
  ]);
  assert.equal(await bus.eventLog.currentVersion(a), 2);
  assert.equal(await bus.eventLog.currentVersion(b), 2);
  // Global sequence is a strict increasing total order with no gaps/dupes.
  const seqs = (await bus.eventLog.read(1)).map((s) => s.sequence);
  assert.deepEqual(seqs, [1, 2, 3, 4]);
  // Per-stream versions are 1..n in order.
  assert.deepEqual((await bus.eventLog.readStream(a)).map((s) => s.streamVersion), [1, 2]);
  assert.deepEqual((await bus.eventLog.readStream(b)).map((s) => s.streamVersion), [1, 2]);
});

test('idempotent delivery: duplicate redelivery never double-processes a consumer', async () => {
  const bus = new EventBus();
  let count = 0;
  bus.subscribe({ subscriber: 'projector', eventTypes: ['*'], handler: () => { count += 1; } });
  const ev = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: {} });
  const stored = await bus.publish(ev);
  await bus.redeliver(stored);
  await bus.redeliver(stored);
  assert.equal(count, 1, 'at-least-once delivery + idempotency => exactly one effect');
});
