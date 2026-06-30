/**
 * EventLog conformance contract (KMOS-0203). Any storage adapter claiming to be
 * a KMOS EventLog MUST pass this. Method results are awaited, so it validates
 * BOTH synchronous (in-memory) and asynchronous (Postgres) implementations
 * against one contract — the mechanism that keeps storage replaceable.
 */
import { createEvent, newCanonicalId, type CanonicalEvent } from '@kmos/canonical-kernel';
import { expect, expectEqual, expectRejects } from '../runner.js';
import type { ConformanceCheck } from '../types.js';

/** Structural EventLog (sync or async) — results are awaited by the contract. */
export interface EventLogLike {
  append(streamId: string, event: CanonicalEvent, options?: { expectedVersion?: number }): unknown;
  currentVersion(streamId: string): unknown;
  read(fromSequence?: number): unknown;
  readStream(streamId: string): unknown;
  size(): unknown;
}

const ev = (subjectId: string): CanonicalEvent =>
  createEvent({ type: 'AssetRegistered', schemaVersion: '1.0', producer: 'AssetRegistry', subjectId, payload: {} });

export function eventLogContract(makeLog: () => EventLogLike): ConformanceCheck[] {
  return [
    { id: 'eventlog.empty', description: 'A fresh log has size 0 and version 0', run: async () => {
      const log = makeLog();
      expectEqual(await log.size(), 0, 'empty size');
      expectEqual(await log.currentVersion(newCanonicalId('Asset')), 0, 'empty version');
      expectEqual((await log.read() as unknown[]).length, 0, 'empty read');
    } },
    { id: 'eventlog.append.sequence', description: 'append assigns a monotonic global sequence', run: async () => {
      const log = makeLog(); const a = newCanonicalId('Asset'); const b = newCanonicalId('Asset');
      await log.append(a, ev(a)); await log.append(b, ev(b));
      const all = await log.read(1) as { sequence: number }[];
      expect(all.length === 2 && all[0]!.sequence === 1 && all[1]!.sequence === 2, 'sequence 1,2');
    } },
    { id: 'eventlog.append.stream-version', description: 'append assigns 1-based per-stream version', run: async () => {
      const log = makeLog(); const s = newCanonicalId('Asset');
      await log.append(s, ev(s)); await log.append(s, ev(s));
      expectEqual(await log.currentVersion(s), 2, 'stream version');
      const stream = await log.readStream(s) as { streamVersion: number }[];
      expect(stream.length === 2 && stream[0]!.streamVersion === 1 && stream[1]!.streamVersion === 2, 'versions 1,2');
    } },
    { id: 'eventlog.optimistic-concurrency.ok', description: 'correct expectedVersion succeeds', run: async () => {
      const log = makeLog(); const s = newCanonicalId('Asset');
      await log.append(s, ev(s), { expectedVersion: 0 });
      await log.append(s, ev(s), { expectedVersion: 1 });
      expectEqual(await log.currentVersion(s), 2, 'after 2 appends');
    } },
    { id: 'eventlog.optimistic-concurrency.conflict', description: 'stale expectedVersion is rejected (lost-update prevented)', run: async () => {
      const log = makeLog(); const s = newCanonicalId('Asset');
      await log.append(s, ev(s), { expectedVersion: 0 });
      await expectRejects(() => log.append(s, ev(s), { expectedVersion: 0 }), /conflict/i, 'stale append');
    } },
    { id: 'eventlog.readStream.isolation', description: 'readStream returns only that stream in version order', run: async () => {
      const log = makeLog(); const a = newCanonicalId('Asset'); const b = newCanonicalId('Asset');
      await log.append(a, ev(a)); await log.append(b, ev(b)); await log.append(a, ev(a));
      expectEqual((await log.readStream(a) as unknown[]).length, 2, 'stream a count');
      expectEqual((await log.readStream(b) as unknown[]).length, 1, 'stream b count');
    } },
    { id: 'eventlog.append-only', description: 'history is append-only (read from a sequence never shrinks)', level: 'Certified', run: async () => {
      const log = makeLog(); const s = newCanonicalId('Asset');
      await log.append(s, ev(s));
      const before = (await log.read(1) as unknown[]).length;
      await log.append(s, ev(s));
      const after = (await log.read(1) as unknown[]).length;
      expect(after > before, 'log only grows');
    } },
  ];
}
