/**
 * Production `SqlClient` adapter over the `pg` driver (KMOS-0203; DECISIONS D-B).
 *
 * This is the thin composition seam between {@link PostgresEventLog} (which knows
 * only the {@link SqlClient} PORT) and a real PostgreSQL server. It is the ONLY
 * file in the platform that imports `pg`, and it lives under `infrastructure/`,
 * so the architecture-fitness `ports-adapters` rule keeps the driver out of every
 * caller — the EventLog port stays storage-agnostic and replaceable.
 *
 * Usage (composition root / operations):
 *   const sql = new PgSqlClient(process.env.KMOS_DATABASE_URL!);
 *   await sql.query(EVENTS_TABLE_DDL);            // one-time migration
 *   const log = new PostgresEventLog(sql);        // satisfies the kernel EventLog
 */

import pg from 'pg';
import type { Pool as PgPool, PoolConfig } from 'pg';
import type { SqlClient, SqlResult } from './postgres-event-log.js';

const { Pool } = pg;

export class PgSqlClient implements SqlClient {
  private readonly pool: PgPool;

  /** Construct from a connection string (e.g. KMOS_DATABASE_URL) or a PoolConfig. */
  constructor(config: string | PoolConfig) {
    this.pool = new Pool(typeof config === 'string' ? { connectionString: config } : config);
  }

  async query<R = Record<string, unknown>>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<SqlResult<R>> {
    const result = await this.pool.query(text, params as unknown[]);
    return { rows: result.rows as readonly R[] };
  }

  /** Release pooled connections (call on shutdown / after tests). */
  async end(): Promise<void> {
    await this.pool.end();
  }
}
