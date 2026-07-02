/**
 * Durable persistence for Podcast Studio's per-episode JOB STATE.
 *
 * The canonical knowledge (concepts, assets, evidence refs, lineage, trust) already
 * lives durably in KMOS and rehydrates from the event log on boot. What the app must
 * ALSO persist to be a daily driver — "come back tomorrow, everything is still there" —
 * is the operational/view layer of each episode: its pipeline status, the parsed
 * transcript segments powering evidence quotes, the chapter/subtitle/clip layout, the
 * summary/moments, and the per-concept trust it computed.
 *
 * This is APP-OWNED operational state, stored in a dedicated table in the SAME shared
 * PostgreSQL the platform already uses (no duplicate services) via the KMOS `SqlClient`
 * port. With no database configured it is simply absent and the app stays in-memory.
 */

import type { SqlClient } from '@kmos/events';
import type { CanonicalId } from '@kmos/canonical-kernel';
import type { Episode, TrustView } from './types.js';

/** An episode plus the derived state that must survive a restart. */
export interface PersistedEpisode {
  readonly episode: Episode;
  /** Per-concept trust, keyed by concept id. */
  readonly trust: Record<string, TrustView>;
}

/** Persistence port for episode job-state. Implementations must be idempotent. */
export interface EpisodeStore {
  init(): Promise<void>;
  load(): Promise<PersistedEpisode[]>;
  save(entry: PersistedEpisode): Promise<void>;
  close?(): Promise<void>;
}

const DDL = `CREATE TABLE IF NOT EXISTS ps_episodes (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);`;

/** PostgreSQL-backed store over the shared KMOS `SqlClient`. Each episode is one JSONB
 * row (upserted on every state change); recovery is a single table scan. */
export class PostgresEpisodeStore implements EpisodeStore {
  private readonly sql: SqlClient;

  constructor(sql: SqlClient) {
    this.sql = sql;
  }

  async init(): Promise<void> {
    await this.sql.query(DDL);
  }

  async load(): Promise<PersistedEpisode[]> {
    const { rows } = await this.sql.query<{ data: PersistedEpisode }>(
      'SELECT data FROM ps_episodes ORDER BY updated_at ASC',
    );
    return rows.map((r) => r.data);
  }

  async save(entry: PersistedEpisode): Promise<void> {
    await this.sql.query(
      `INSERT INTO ps_episodes (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [entry.episode.id, JSON.stringify(entry)],
    );
  }
}

/** Build the trust map for an episode's concepts from a full trust cache. */
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
