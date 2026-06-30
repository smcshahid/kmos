/**
 * Reusable EventLog contract test (KMOS-9999 §16 contract tests).
 *
 * `runEventLogContract(makeLog)` asserts the semantics every EventLog adapter
 * must honour, independent of storage technology:
 *   - append assigns a monotonic global sequence and a 1-based per-stream version;
 *   - optimistic concurrency: a wrong `expectedVersion` yields a Conflict;
 *   - read() returns global order; readStream() returns per-stream order;
 *   - size() counts all appended events.
 *
 * It is run here against the kernel's in-memory `InMemoryEventLog` AND against
 * `PostgresEventLog` backed by an in-memory fake `SqlClient` (a Map-based
 * stand-in mimicking INSERT/SELECT, including the UNIQUE(stream_id, version)
 * conflict). Running one contract over both proves the Postgres adapter is a
 * faithful, drop-in replacement for the port — with no real database.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  InMemoryEventLog,
  KmosError,
  createEvent,
  type AppendOptions,
  type CanonicalEvent,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import {
  PostgresEventLog,
  type SqlClient,
  type SqlResult,
} from '@kmos/events';

type MaybePromise<T> = T | Promise<T>;

/** Structural EventLog usable for sync OR async adapters (results are awaited). */
interface ContractEventLog {
  append(streamId: string, event: CanonicalEvent, options?: AppendOptions): MaybePromise<StoredEvent>;
  currentVersion(streamId: string): MaybePromise<number>;
  read(fromSequence?: number): MaybePromise<readonly StoredEvent[]>;
  readStream(streamId: string): MaybePromise<readonly StoredEvent[]>;
  size(): MaybePromise<number>;
}

let counter = 0;
function event(type: string): CanonicalEvent {
  counter += 1;
  return createEvent({
    type,
    schemaVersion: '1.0',
    producer: 'ContractTest',
    payload: { n: counter },
    time: '2026-06-30T00:00:00.000Z',
    eventId: `Event:contract-${counter}`,
  });
}

/** The reusable contract. `makeLog` returns a fresh, empty log per call. */
export function runEventLogContract(
  label: string,
  makeLog: () => ContractEventLog,
): void {
  test(`[${label}] empty log: size 0, current version 0, empty reads`, async () => {
    const log = makeLog();
    assert.equal(await log.size(), 0);
    assert.equal(await log.currentVersion('S:1'), 0);
    assert.deepEqual(await log.read(), []);
    assert.deepEqual(await log.readStream('S:1'), []);
  });

  test(`[${label}] append assigns monotonic global sequence`, async () => {
    const log = makeLog();
    const a = await log.append('S:1', event('AssetRegistered'));
    const b = await log.append('S:2', event('AssetRegistered'));
    const c = await log.append('S:1', event('KnowledgeUpdated'));
    assert.equal(a.sequence, 1);
    assert.equal(b.sequence, 2);
    assert.equal(c.sequence, 3);
    assert.equal(await log.size(), 3);
  });

  test(`[${label}] append assigns 1-based per-stream version`, async () => {
    const log = makeLog();
    const a = await log.append('S:1', event('AssetRegistered'));
    const b = await log.append('S:1', event('KnowledgeUpdated'));
    const other = await log.append('S:2', event('AssetRegistered'));
    assert.equal(a.streamVersion, 1);
    assert.equal(b.streamVersion, 2);
    assert.equal(other.streamVersion, 1);
    assert.equal(await log.currentVersion('S:1'), 2);
    assert.equal(await log.currentVersion('S:2'), 1);
  });

  test(`[${label}] optimistic concurrency: correct expectedVersion succeeds`, async () => {
    const log = makeLog();
    await log.append('S:1', event('AssetRegistered'), { expectedVersion: 0 });
    const second = await log.append('S:1', event('KnowledgeUpdated'), { expectedVersion: 1 });
    assert.equal(second.streamVersion, 2);
  });

  test(`[${label}] optimistic concurrency: wrong expectedVersion throws Conflict`, async () => {
    const log = makeLog();
    await log.append('S:1', event('AssetRegistered'));
    await assert.rejects(
      async () => log.append('S:1', event('KnowledgeUpdated'), { expectedVersion: 0 }),
      (err: unknown) => {
        assert.ok(err instanceof KmosError, 'expected a KmosError');
        assert.equal(err.category, 'Conflict');
        assert.equal(err.retryable, true);
        return true;
      },
    );
    // the rejected append must not have been persisted
    assert.equal(await log.size(), 1);
    assert.equal(await log.currentVersion('S:1'), 1);
  });

  test(`[${label}] read() returns events in global sequence order`, async () => {
    const log = makeLog();
    await log.append('S:1', event('AssetRegistered'));
    await log.append('S:2', event('AssetRegistered'));
    await log.append('S:1', event('KnowledgeUpdated'));
    const all = await log.read();
    assert.deepEqual(
      all.map((s) => s.sequence),
      [1, 2, 3],
    );
    // read(fromSequence) is inclusive and 1-based
    const tail = await log.read(2);
    assert.deepEqual(
      tail.map((s) => s.sequence),
      [2, 3],
    );
  });

  test(`[${label}] readStream() returns only that stream, in version order`, async () => {
    const log = makeLog();
    await log.append('S:1', event('AssetRegistered'));
    await log.append('S:2', event('AssetRegistered'));
    await log.append('S:1', event('KnowledgeUpdated'));
    const s1 = await log.readStream('S:1');
    assert.deepEqual(
      s1.map((s) => s.streamVersion),
      [1, 2],
    );
    assert.ok(s1.every((s) => s.streamId === 'S:1'));
    const s2 = await log.readStream('S:2');
    assert.equal(s2.length, 1);
  });
}

/* ------------------------------------------------------------------ */
/* In-memory fake SqlClient: a Map-based stand-in for the events table. */
/* ------------------------------------------------------------------ */

interface FakeRow {
  sequence: number;
  stream_id: string;
  version: number;
  event: CanonicalEvent;
}

/**
 * Mimics just enough Postgres behaviour for `PostgresEventLog`: a global
 * autoincrement `sequence`, and a UNIQUE(stream_id, version) constraint that
 * raises an error with SQLSTATE 23505 on conflict. It recognises the adapter's
 * five statements by keyword and serves them from an in-memory array.
 */
class FakeSqlClient implements SqlClient {
  private rows: FakeRow[] = [];
  private seq = 0;
  private readonly keys = new Set<string>();

  async query<R = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<SqlResult<R>> {
    const sql = text.trim();

    if (sql.startsWith('INSERT INTO events')) {
      const streamId = params[0] as string;
      const version = params[1] as number;
      const evt = params[2] as CanonicalEvent;
      const key = `${streamId}@${version}`;
      if (this.keys.has(key)) {
        const err = new Error('duplicate key value violates unique constraint') as Error & {
          code: string;
        };
        err.code = '23505';
        throw err;
      }
      this.seq += 1;
      const row: FakeRow = { sequence: this.seq, stream_id: streamId, version, event: evt };
      this.rows.push(row);
      this.keys.add(key);
      return { rows: [{ ...row } as unknown as R] };
    }

    if (sql.includes('MAX(version)')) {
      const streamId = params[0] as string;
      const max = this.rows
        .filter((r) => r.stream_id === streamId)
        .reduce((acc, r) => Math.max(acc, r.version), 0);
      return { rows: [{ max } as unknown as R] };
    }

    if (sql.includes('COUNT(*)')) {
      return { rows: [{ count: this.rows.length } as unknown as R] };
    }

    if (sql.includes('WHERE sequence >=')) {
      const from = params[0] as number;
      const rows = this.rows
        .filter((r) => r.sequence >= from)
        .sort((a, b) => a.sequence - b.sequence)
        .map((r) => ({ ...r }) as unknown as R);
      return { rows };
    }

    if (sql.includes('WHERE stream_id =')) {
      const streamId = params[0] as string;
      const rows = this.rows
        .filter((r) => r.stream_id === streamId)
        .sort((a, b) => a.version - b.version)
        .map((r) => ({ ...r }) as unknown as R);
      return { rows };
    }

    throw new Error(`FakeSqlClient: unrecognized SQL: ${sql}`);
  }
}

/* ------------------------------------------------------------------ */
/* Run the one contract against both adapters.                        */
/* ------------------------------------------------------------------ */

runEventLogContract('InMemoryEventLog', () => new InMemoryEventLog());
runEventLogContract('PostgresEventLog+FakeSql', () => new PostgresEventLog(new FakeSqlClient()));
