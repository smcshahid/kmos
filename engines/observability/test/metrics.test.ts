import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsRegistry } from '../src/index.js';

test('counters increment and memoize by name', () => {
  const m = new MetricsRegistry();
  m.counter('events.published').inc();
  m.counter('events.published').inc(4);
  assert.equal(m.counter('events.published').value(), 5);
  assert.equal(m.snapshot().counters['events.published'], 5);
});

test('counter rejects negative deltas', () => {
  const m = new MetricsRegistry();
  assert.throws(() => m.counter('c').inc(-1), RangeError);
});

test('gauges set, inc and dec', () => {
  const m = new MetricsRegistry();
  const g = m.gauge('queue.depth');
  g.set(10);
  g.inc(2);
  g.dec(5);
  assert.equal(g.value(), 7);
  assert.equal(m.snapshot().gauges['queue.depth'], 7);
});

test('timer records elapsed using injected clock and is idempotent', () => {
  let t = 1000;
  const m = new MetricsRegistry({ now: () => t });
  const stop = m.timer('handler.latency');
  t = 1075;
  const elapsed = stop();
  assert.equal(elapsed, 75);
  // calling stop again must not double-record
  t = 9999;
  stop();
  const snap = m.snapshot().timers['handler.latency'];
  assert.ok(snap);
  assert.equal(snap.count, 1);
  assert.equal(snap.totalMs, 75);
  assert.equal(snap.minMs, 75);
  assert.equal(snap.maxMs, 75);
  assert.equal(snap.avgMs, 75);
});

test('timer aggregates multiple samples (min/max/avg)', () => {
  let t = 0;
  const m = new MetricsRegistry({ now: () => t });
  for (const d of [10, 30, 20]) {
    const stop = m.timer('op');
    t += d;
    stop();
  }
  const snap = m.snapshot().timers['op'];
  assert.ok(snap);
  assert.equal(snap.count, 3);
  assert.equal(snap.totalMs, 60);
  assert.equal(snap.minMs, 10);
  assert.equal(snap.maxMs, 30);
  assert.equal(snap.avgMs, 20);
});

test('snapshot of empty registry is empty', () => {
  const snap = new MetricsRegistry().snapshot();
  assert.deepEqual(snap.counters, {});
  assert.deepEqual(snap.gauges, {});
  assert.deepEqual(snap.timers, {});
});
