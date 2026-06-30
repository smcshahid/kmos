import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StructuredLogger, InMemoryLogSink } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

test('logger captures structured records with level, message, fields and time', () => {
  const sink = new InMemoryLogSink();
  const log = new StructuredLogger({ sink, now: fixedNow });
  log.info('asset registered', { assetId: 'Asset:1', count: 3 });
  const records = sink.records();
  assert.equal(records.length, 1);
  assert.deepEqual(records[0], {
    level: 'info',
    message: 'asset registered',
    fields: { assetId: 'Asset:1', count: 3 },
    time: '2026-06-30T00:00:00.000Z',
  });
});

test('all four levels emit', () => {
  const sink = new InMemoryLogSink();
  const log = new StructuredLogger({ sink, now: fixedNow });
  log.debug('d');
  log.info('i');
  log.warn('w');
  log.error('e');
  assert.deepEqual(
    sink.records().map((r) => r.level),
    ['debug', 'info', 'warn', 'error'],
  );
});

test('minLevel filters out records below threshold', () => {
  const sink = new InMemoryLogSink();
  const log = new StructuredLogger({ sink, now: fixedNow, minLevel: 'warn' });
  log.debug('d');
  log.info('i');
  log.warn('w');
  log.error('e');
  assert.deepEqual(
    sink.records().map((r) => r.level),
    ['warn', 'error'],
  );
});

test('base fields and child() context merge into every record', () => {
  const sink = new InMemoryLogSink();
  const log = new StructuredLogger({ sink, now: fixedNow, baseFields: { service: 'events' } });
  const child = log.child({ correlationId: 'c-1' });
  child.info('handled', { step: 'persist' });
  const rec = sink.records()[0];
  assert.ok(rec);
  assert.deepEqual(rec.fields, { service: 'events', correlationId: 'c-1', step: 'persist' });
});

test('default sink is in-memory and readable via logger.target', () => {
  const log = new StructuredLogger({ now: fixedNow });
  log.info('hello');
  const sink = log.target as InMemoryLogSink;
  assert.equal(sink.records().length, 1);
});
