/**
 * The Conformance Kit certifies the kernel's own reference adapters — proving
 * both that the kit works and that the in-memory implementations are compliant.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryEventLog, ALLOW_ALL, createCanonicalObject, createEvent, newCanonicalId } from '@kmos/canonical-kernel';
import { transcription } from '@kmos/reference-capabilities';
import {
  runConformance, eventLogContract, authorizerContract, capabilityHandlerContract,
  canonicalObjectContract, canonicalEventContract, CONFORMANCE_PROFILES,
} from '../src/index.js';

test('Conformance Kit publishes a profile catalogue', () => {
  assert.ok(CONFORMANCE_PROFILES.length >= 5);
});

test('EventLog profile: InMemoryEventLog is COMPLIANT (Certified)', async () => {
  const r = await runConformance('eventlog', eventLogContract(() => new InMemoryEventLog()), 'Certified');
  assert.equal(r.compliant, true, JSON.stringify(r.results.filter((x) => !x.passed)));
  assert.ok(r.passed >= 6);
});

test('Authorizer profile: ALLOW_ALL is COMPLIANT', async () => {
  const r = await runConformance('authorizer', authorizerContract(() => ALLOW_ALL), 'Certified');
  assert.equal(r.compliant, true, JSON.stringify(r.results.filter((x) => !x.passed)));
});

test('Capability handler profile: reference transcription is COMPLIANT', async () => {
  const r = await runConformance('capability-handler', capabilityHandlerContract(() => transcription.create(), { audioRef: 'kmos:Asset:x' }), 'Certified');
  assert.equal(r.compliant, true, JSON.stringify(r.results.filter((x) => !x.passed)));
});

test('Canonical object profile: a kernel object is COMPLIANT', async () => {
  const obj = createCanonicalObject({ id: newCanonicalId('Asset'), type: 'Asset', schemaVersion: '1.0', owner: 'AssetRegistry', body: {}, now: '2026-06-30T00:00:00.000Z' });
  const r = await runConformance('canonical-object', canonicalObjectContract(() => obj));
  assert.equal(r.compliant, true, JSON.stringify(r.results.filter((x) => !x.passed)));
});

test('Canonical event profile: a kernel event is COMPLIANT (Certified)', async () => {
  const e = createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', payload: {} });
  const r = await runConformance('canonical-event', canonicalEventContract(() => e), 'Certified');
  assert.equal(r.compliant, true, JSON.stringify(r.results.filter((x) => !x.passed)));
});

test('a non-compliant adapter is detected (negative control)', async () => {
  // A broken "authorizer" that throws — must be reported NON-compliant, not crash the run.
  const broken = { authorize() { throw new Error('boom'); } } as any;
  const r = await runConformance('authorizer', authorizerContract(() => broken), 'Core');
  assert.equal(r.compliant, false);
  assert.ok(r.failed >= 1);
});
