/**
 * Postgres EventLog adapter (KMOS-0203; DECISIONS D-B Postgres-first).
 *
 * Reference adapter realizing the kernel's EventLog port on PostgreSQL, using
 * the transactional-append design from the Readiness Report §7.1:
 *
 *   - one `events` table with a global `sequence BIGSERIAL` (total replay order)
 *     plus a per-stream `version`, and `UNIQUE(stream_id, version)` enforcing
 *     optimistic concurrency at the database level;
 *   - `append` reads the current version then INSERTs version = current+1; a
 *     unique-violation (concurrent writer, or a stale `expectedVersion`) is
 *     surfaced as a kernel `KmosError` of category 'Conflict' (retryable).
 *
 * One async port (CRIT-1 resolved, KEP-001): the kernel `EventLog` port is now
 * asynchronous, so this adapter implements the *same* kernel port directly —
 * there is no separate production interface. The reusable EventLog contract test
 * awaits every call and runs against BOTH `InMemoryEventLog` and this adapter,
 * proving one port satisfied by two adapters.
 *
 * Storage replaceability (constitution §2): this adapter lives under
 * `infrastructure/` and depends ONLY on the minimal {@link SqlClient} PORT
 * defined here — NOT on the `pg` driver, which is injected. The adapter imports
 * no infrastructure module, proving the port is satisfiable on Postgres without
 * coupling callers to a database (fitness `ports-adapters` rule satisfied).
 */

import { KmosError } from '@kmos/canonical-kernel';
import type {
  AppendOptions,
  CanonicalEvent,
  EventLog,
  StoredEvent,
} from '@kmos/canonical-kernel';

/** A query result: rows of arbitrary shape (mirrors `pg`'s `QueryResult`). */
export interface SqlResult<R = Record<string, unknown>> {
  readonly rows: readonly R[];
}

/**
 * Minimal SQL client PORT: a subset of the `pg` client surface — a single
 * parameterized `query(text, params)` returning rows. Production injects a thin
 * wrapper over `pg.Pool`; tests inject an in-memory fake. The adapter NEVER
 * imports `pg`, only this interface — that is what keeps storage replaceable.
 */
export interface SqlClient {
  query<R = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<SqlResult<R>>;
}

/**
 * @deprecated The kernel `EventLog` port is asynchronous as of KEP-001, so a
 * database adapter implements it directly. This alias preserves the name for one
 * RC for any out-of-tree consumer that referenced it; it is removed in v1.1.
 */
export type AsyncEventLog = EventLog;

/** Postgres SQLSTATE for unique_violation. */
const UNIQUE_VIOLATION = '23505';

/**
 * DDL for the events table. A global `sequence BIGSERIAL` gives total replay
 * order; `UNIQUE(stream_id, version)` enforces per-stream optimistic
 * concurrency; `event JSONB` stores the canonical envelope verbatim. History is
 * append-only — no UPDATE/DELETE.
 */
export const EVENTS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS events (
  sequence    BIGSERIAL PRIMARY KEY,
  stream_id   TEXT      NOT NULL,
  version     INTEGER   NOT NULL,
  event       JSONB     NOT NULL,
  CONSTRAINT events_stream_version_unique UNIQUE (stream_id, version)
);
CREATE INDEX IF NOT EXISTS events_stream_id_idx ON events (stream_id, version);`;

/** Row shape returned by the SELECTs below. */
interface EventRow {
  readonly sequence: number | string;
  readonly stream_id: string;
  readonly version: number | string;
  readonly event: CanonicalEvent | string;
}

function hasCode(value: unknown): value is { readonly code: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as { code: unknown }).code === 'string'
  );
}

/** Coerce a column that may arrive as number, bigint, or numeric-string. */
function toNum(value: number | string): number {
  return typeof value === 'number' ? value : Number(value);
}

/** Coerce JSONB that may arrive parsed (pg) or as text (some drivers). */
function toEvent(value: CanonicalEvent | string): CanonicalEvent {
  return typeof value === 'string' ? (JSON.parse(value) as CanonicalEvent) : value;
}

function rowToStored(row: EventRow): StoredEvent {
  return {
    sequence: toNum(row.sequence),
    streamId: row.stream_id,
    streamVersion: toNum(row.version),
    event: toEvent(row.event),
  };
}

/**
 * Postgres-backed EventLog. Construct with an injected {@link SqlClient}; run
 * {@link EVENTS_TABLE_DDL} once (migration) before first use.
 */
export class PostgresEventLog implements EventLog {
  private readonly sql: SqlClient;

  constructor(sql: SqlClient) {
    this.sql = sql;
  }

  async append(
    streamId: string,
    event: CanonicalEvent,
    options?: AppendOptions,
  ): Promise<StoredEvent> {
    const current = await this.currentVersion(streamId);
    if (options?.expectedVersion !== undefined && options.expectedVersion !== current) {
      throw new KmosError('Optimistic concurrency conflict on stream append', {
        category: 'Conflict',
        code: 'event.stream.version_conflict',
        subject: streamId,
        detail: { expected: options.expectedVersion, actual: current },
      });
    }
    const nextVersion = current + 1;
    try {
      const result = await this.sql.query<EventRow>(
        `INSERT INTO events (stream_id, version, event)
         VALUES ($1, $2, $3)
         RETURNING sequence, stream_id, version, event`,
        [streamId, nextVersion, event],
      );
      const row = result.rows[0];
      if (row === undefined) {
        throw new KmosError('Append did not return the inserted row', {
          category: 'Infrastructure',
          code: 'event.stream.append_no_row',
          subject: streamId,
        });
      }
      return rowToStored(row);
    } catch (cause) {
      // A concurrent writer took version = nextVersion first -> unique violation.
      if (hasCode(cause) && cause.code === UNIQUE_VIOLATION) {
        throw new KmosError('Optimistic concurrency conflict on stream append', {
          category: 'Conflict',
          code: 'event.stream.version_conflict',
          subject: streamId,
          detail: { expected: options?.expectedVersion, attempted: nextVersion },
          cause,
        });
      }
      throw cause;
    }
  }

  async currentVersion(streamId: string): Promise<number> {
    const result = await this.sql.query<{ readonly max: number | string | null }>(
      `SELECT COALESCE(MAX(version), 0) AS max FROM events WHERE stream_id = $1`,
      [streamId],
    );
    const max = result.rows[0]?.max ?? 0;
    return max === null ? 0 : toNum(max);
  }

  async read(fromSequence = 1): Promise<readonly StoredEvent[]> {
    const result = await this.sql.query<EventRow>(
      `SELECT sequence, stream_id, version, event
       FROM events
       WHERE sequence >= $1
       ORDER BY sequence ASC`,
      [fromSequence],
    );
    return result.rows.map(rowToStored);
  }

  async readStream(streamId: string): Promise<readonly StoredEvent[]> {
    const result = await this.sql.query<EventRow>(
      `SELECT sequence, stream_id, version, event
       FROM events
       WHERE stream_id = $1
       ORDER BY version ASC`,
      [streamId],
    );
    return result.rows.map(rowToStored);
  }

  async size(): Promise<number> {
    const result = await this.sql.query<{ readonly count: number | string }>(
      `SELECT COUNT(*) AS count FROM events`,
    );
    return toNum(result.rows[0]?.count ?? 0);
  }
}
