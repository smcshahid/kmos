/**
 * Durable persistence for Knowledge Studio's per-source JOB STATE.
 *
 * The canonical knowledge (concepts, assets, evidence refs, lineage, trust) already
 * lives durably in KMOS and rehydrates from the event log on boot. What the app must
 * ALSO persist to become a daily driver — "come back tomorrow, everything is still
 * there" — is the operational/view layer of each processed source: its pipeline
 * status, the parsed transcript segments that power the evidence-quote projection,
 * the chapter layout, and the per-concept trust it computed.
 *
 * This is APP-OWNED operational state, not canonical business truth, so it is stored
 * in a dedicated table in the SAME shared PostgreSQL the platform already uses (no
 * duplicate services, per the deployment mandate) via the KMOS `SqlClient` port.
 * With no database configured it is simply absent and the app keeps its in-memory
 * behavior.
 */

import type { SqlClient } from '@kmos/events';
import type { CanonicalId } from '@kmos/canonical-kernel';
import type { Source, TrustView } from './types.js';

/** A source plus the derived state that must survive a restart. */
export interface PersistedSource {
  readonly source: Source;
  /** Per-concept trust, keyed by concept id (recomputed during the pipeline). */
  readonly trust: Record<string, TrustView>;
}

/** Persistence port for source job-state. Implementations must be idempotent. */
export interface SourceStore {
  /** Prepare storage (idempotent migration). */
  init(): Promise<void>;
  /** Load all persisted sources (oldest first). */
  load(): Promise<PersistedSource[]>;
  /** Upsert one source's state. */
  save(entry: PersistedSource): Promise<void>;
  /** Release resources (optional). */
  close?(): Promise<void>;
}

const DDL = `CREATE TABLE IF NOT EXISTS ks_sources (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);`;

/**
 * PostgreSQL-backed store over the shared KMOS `SqlClient`. Each source is one JSONB
 * row (upserted on every state change), so recovery is a single table scan and the
 * store carries no schema coupling to the evolving Source shape.
 */
export class PostgresSourceStore implements SourceStore {
  private readonly sql: SqlClient;

  constructor(sql: SqlClient) {
    this.sql = sql;
  }

  async init(): Promise<void> {
    await this.sql.query(DDL);
  }

  async load(): Promise<PersistedSource[]> {
    const { rows } = await this.sql.query<{ data: PersistedSource }>(
      'SELECT data FROM ks_sources ORDER BY updated_at ASC',
    );
    // pg returns jsonb already parsed into a JS object.
    return rows.map((r) => r.data);
  }

  async save(entry: PersistedSource): Promise<void> {
    await this.sql.query(
      `INSERT INTO ks_sources (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [entry.source.id, JSON.stringify(entry)],
    );
  }
}

/** Build the trust map for a source's concepts from a full trust cache. */
export function trustSubset(
  conceptIds: readonly CanonicalId[],
  trust: ReadonlyMap<CanonicalId, TrustView>,
): Record<string, TrustView> {
  const out: Record<string, TrustView> = {};
  for (const id of conceptIds) {
    const t = trust.get(id);
    if (t) out[id] = t;
  }
  return out;
}
