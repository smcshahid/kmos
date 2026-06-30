/**
 * Real-PostgreSQL validation of the EventLog contract (KEP-001 acceptance #2 —
 * the "real-DB proof" that closes CRIT-1).
 *
 * Runs the SAME `runEventLogContract` used for the in-memory adapters, but
 * against `PostgresEventLog` backed by a REAL `PgSqlClient` over a live Postgres,
 * when `KMOS_DATABASE_URL` is set. The CI `database` job provides an ephemeral
 * `pgvector/pgvector:pg16` service and sets that variable, so this exercises the
 * adapter against genuine async storage — not only the in-memory fake.
 *
 * Offline / locally (no KMOS_DATABASE_URL) it registers a single SKIPPED test so
 * `npm test` stays green without a database.
 */

import { test, after } from 'node:test';
import { PostgresEventLog, PgSqlClient, EVENTS_TABLE_DDL } from '@kmos/events';
import { runEventLogContract } from './event-log-contract-suite.js';

const url = process.env.KMOS_DATABASE_URL;

if (!url) {
  test('PostgresEventLog real-PG contract — SKIPPED (set KMOS_DATABASE_URL to run)', { skip: true }, () => {
    /* no database configured; the in-memory + fake-SQL contract still runs */
  });
} else {
  const sql = new PgSqlClient(url);
  after(async () => {
    await sql.end();
  });

  // Each contract case gets a freshly truncated table so the BIGSERIAL global
  // `sequence` restarts at 1 (the contract asserts sequence/version from a clean
  // log). DDL is idempotent (CREATE TABLE IF NOT EXISTS).
  runEventLogContract('PostgresEventLog+RealPG', async () => {
    await sql.query(EVENTS_TABLE_DDL);
    await sql.query('TRUNCATE TABLE events RESTART IDENTITY');
    return new PostgresEventLog(sql);
  });
}
