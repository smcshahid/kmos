/**
 * Durable persistence for CrawlStation's per-job STATE.
 *
 * The canonical acquired knowledge (page Assets, readable-content derivations, lineage,
 * KnowledgeObjects, relationships, trust) already lives durably in KMOS and rehydrates
 * from the event log on boot. What the app must ALSO persist to be a daily driver —
 * "come back tomorrow, every crawl is still here" — is the operational/view layer of
 * each run: its status, stats, per-page records (with the KMOS ids that tie back to the
 * canonical objects), and the recent activity feed.
 *
 * This is APP-OWNED operational state, not canonical truth, so it is stored as one JSONB
 * row per job in the SAME shared PostgreSQL the platform already uses (no duplicate
 * services), reached through the KMOS `SqlClient` port. With no database configured it
 * is simply absent and the app keeps its in-memory behavior.
 */

import type { SqlClient } from '@kmos/events';
import type { CrawlJob } from './types.js';

/** Persistence port for crawl job-state. Implementations must be idempotent. */
export interface CrawlStore {
  /** Prepare storage (idempotent migration). */
  init(): Promise<void>;
  /** Load all persisted jobs (oldest first). */
  load(): Promise<CrawlJob[]>;
  /** Upsert one job's full state. */
  save(job: CrawlJob): Promise<void>;
  /** Release resources (optional). */
  close?(): Promise<void>;
}

const DDL = `CREATE TABLE IF NOT EXISTS cs_crawls (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);`;

/**
 * PostgreSQL-backed store over the shared KMOS `SqlClient`. Each crawl is one JSONB row
 * (upserted on every state change), so recovery is a single table scan and the store
 * carries no schema coupling to the evolving CrawlJob shape.
 */
export class PostgresCrawlStore implements CrawlStore {
  private readonly sql: SqlClient;

  constructor(sql: SqlClient) {
    this.sql = sql;
  }

  async init(): Promise<void> {
    await this.sql.query(DDL);
  }

  async load(): Promise<CrawlJob[]> {
    const { rows } = await this.sql.query<{ data: CrawlJob }>(
      'SELECT data FROM cs_crawls ORDER BY updated_at ASC',
    );
    return rows.map((r) => r.data);
  }

  async save(job: CrawlJob): Promise<void> {
    await this.sql.query(
      `INSERT INTO cs_crawls (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [job.id, JSON.stringify(job)],
    );
  }
}
