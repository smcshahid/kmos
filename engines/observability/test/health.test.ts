import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HealthRegistry } from '../src/index.js';

test('empty registry is Ready', () => {
  assert.equal(new HealthRegistry().overall(), 'Ready');
});

test('all-Ready checks aggregate to Ready', () => {
  const h = new HealthRegistry()
    .register('db', () => ({ state: 'Ready' }))
    .register('broker', () => ({ state: 'Ready' }));
  assert.equal(h.overall(), 'Ready');
});

test('any Degraded makes overall Degraded', () => {
  const h = new HealthRegistry()
    .register('db', () => ({ state: 'Ready' }))
    .register('cache', () => ({ state: 'Degraded', detail: 'high latency' }));
  assert.equal(h.overall(), 'Degraded');
});

test('any Unavailable makes overall Unavailable even with a Degraded present', () => {
  const h = new HealthRegistry()
    .register('cache', () => ({ state: 'Degraded' }))
    .register('db', () => ({ state: 'Unavailable', detail: 'connection refused' }));
  assert.equal(h.overall(), 'Unavailable');
});

test('report() includes per-check results and the aggregate state', () => {
  const h = new HealthRegistry()
    .register('db', () => ({ state: 'Ready' }))
    .register('broker', () => ({ state: 'Unavailable', detail: 'down' }));
  const report = h.report();
  assert.equal(report.state, 'Unavailable');
  assert.equal(report.checks['db']?.state, 'Ready');
  assert.equal(report.checks['broker']?.detail, 'down');
});

test('unregister removes a check', () => {
  const h = new HealthRegistry().register('db', () => ({ state: 'Unavailable' }));
  assert.equal(h.overall(), 'Unavailable');
  assert.equal(h.unregister('db'), true);
  assert.equal(h.overall(), 'Ready');
});
