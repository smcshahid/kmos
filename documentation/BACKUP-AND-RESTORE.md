# KMOS Backup & Restore

_What to back up, how, and how to restore a KMOS deployment — centered on the
append-only event log, the durable source of truth._

_Grounded in the repository: the Postgres EventLog adapter
(`platform/events/src/infrastructure/postgres-event-log.ts`, `EVENTS_TABLE_DDL`,
`PgSqlClient`), the disaster-recovery test
(`testing/resilience/disaster-recovery.test.ts`), the replay engine
(`@kmos/canonical-kernel` `replay`, `EventService.replayEvents`), and the
operations model in `documentation/OPERATIONS-GUIDE.md`._

_Last updated: 2026-06-30 · Audience: operators, release engineers, on-call._

Companion docs: [`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md) §6–7 (recovery &
retention), [`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md) (RPO/RTO framing),
[`UPGRADE-GUIDE.md`](UPGRADE-GUIDE.md). This guide describes procedures; it does
**not** claim a backup or restore has been executed against production
infrastructure.

---

## 1. The principle: back up the log, not the projections

KMOS's recovery model is its defining operational property: **institutional memory
is the event log, and everything else is derived from it.**

- The **append-only `events` table is the system of record** — the durable
  institutional memory. It has a real Postgres adapter (`PostgresEventLog`) with a
  simple, stable schema (`EVENTS_TABLE_DDL`): one `events` table, a global
  `sequence BIGSERIAL` giving total replay order, a per-stream `version`,
  `UNIQUE(stream_id, version)` enforcing optimistic concurrency, and the canonical
  envelope stored verbatim as `JSONB`. History is append-only — no `UPDATE`, no
  `DELETE`.
- The **read models are NOT the system of record.** The Knowledge graph, the
  Search index, workflow execution state, and every other projection are *derived*
  and are **rebuildable by replaying the log** (KMOS-0201 §12; ADR-0009). In this
  RC they are in-memory projections behind ports — there is no per-service
  Postgres adapter for them yet — so they are not even things you *can* back up
  durably; you regenerate them.

The operational consequence: **you back up the event log above all else.** If the
log survives, every projection can be reconstructed. If the log is lost, no
projection backup can recover the institution's true state.

---

## 2. What to back up

| Asset class | What it is | Backup approach | Status |
|---|---|---|---|
| **`events` table** | The append-only event log = institutional memory, the system of record | `pg_dump` of the `events` table (§3) + continuous archival / PITR | Real PG adapter + DDL exist; live PITR is deployment work (roadmap) |
| **Object storage (asset bytes)** | The raw bytes of assets referenced by `storageRef`; the log holds references + SHA-256 checksums, not the bytes | Replicated object storage; WORM/Object-Lock for retention & legal hold | Modelled; enforcement is roadmap |
| **Configuration** | `ConfigurationVersion` records (versioned config objects) | Backed up with the database; secrets are **referenced, not inlined** | Config is in the event/config store; durable store is roadmap |
| **Secrets** | Never inlined — config stores a `SecretReference`; the clear value is resolved at runtime | Backed up by the secret store's own policy, **not** by KMOS | `EnvSecretResolver` today; Vault/KMS is roadmap |

Notes:

- **Asset bytes vs. asset metadata.** The event log records that an asset exists,
  its provenance, its `storageRef`, and its SHA-256 checksum — but **not** the
  bytes themselves. To fully restore, you need the log *and* the object storage the
  `storageRef`s point at. Integrity of restored bytes is verifiable against the
  stored checksum / `IntegrityRecord`.
- **Secrets are out of scope for KMOS backups by design.** A `ConfigurationVersion`
  never contains a clear secret (`OPERATIONS-GUIDE.md` §4); the `SecretResolver`
  port resolves it at runtime. Back secrets up wherever they actually live — the
  environment/secret store — under that system's policy, never in a KMOS dump.

---

## 3. How to back up the event log

The `events` table is **append-only**, which is exactly what makes it safe and
cheap to back up: rows are only ever inserted, never mutated or deleted, so a dump
is a consistent point-in-time cut of institutional memory up to the highest
`sequence` at dump time.

Logical dump of just the event log:

```bash
# Dump the events table (schema + data) from the KMOS database.
pg_dump "$KMOS_DATABASE_URL" --table=events --format=custom --file=kmos-events.dump

# Or a plain-SQL dump, data only, for portability / inspection:
pg_dump "$KMOS_DATABASE_URL" --table=events --data-only --file=kmos-events.sql
```

`KMOS_DATABASE_URL` is the connection string the Postgres adapters consume (set by
the root compose to `postgres://kmos:kmos@postgres:5432/kmos`;
`DEPLOYMENT-GUIDE.md` §5).

Guidance:

- **Prefer continuous archival + PITR** for the production event log (WAL archiving
  / base backups) so your recovery point is bounded by archival lag, not by how
  long ago you last ran `pg_dump`. `pg_dump` is a good coarse snapshot and the
  right tool for evaluation and pre-upgrade safety copies.
- **Take a fresh dump before every upgrade** (`UPGRADE-GUIDE.md` §1) so rollback
  and DR always have a known-good log.
- Because the table is append-only, an incremental backup is conceptually "all rows
  with `sequence` greater than the last backed-up `sequence`" — the global
  `sequence` column gives you a natural, monotonic high-water mark.

> **Honesty note.** The Postgres `EventLog` adapter, its DDL, and a `PgSqlClient`
> exist and are validated by the EventLog contract against a real Postgres in CI.
> A live production database, WAL archiving, PITR, and a rehearsed restore runbook
> are deployment-time work (roadmap; `OPERATIONS-GUIDE.md` §6.2). The commands
> above are the intended procedure, not a report of an executed production backup.

---

## 4. Restore + rebuild

Restore is two steps: **(1) restore the durable event log, then (2) rebuild every
projection by replay.** You never restore a projection from a projection backup —
projections are regenerated from the log.

### 4.1 Restore the event log

```bash
# Recreate the schema if needed (EVENTS_TABLE_DDL), then restore the dump.
pg_restore --dbname="$KMOS_DATABASE_URL" kmos-events.dump
# (plain SQL: psql "$KMOS_DATABASE_URL" -f kmos-events.sql)
```

After restore, the `events` table holds the surviving institutional history with
its original `sequence`/`stream_id`/`version` ordering intact.

### 4.2 Restore asset bytes

Restore the object storage the assets' `storageRef`s point at (from its own
replicated backup). Verify restored bytes against the SHA-256 checksum recorded in
the log (`IntegrityRecord`); a mismatch means the byte store, not the log, is the
problem.

### 4.3 Rebuild every projection by replay

With the log restored, start the platform. Each read model is reconstructed by
folding the event log from global sequence 1 through the replay engine — the
Knowledge graph, the Search index, workflow execution state, and the rest. Health
returns `Ready`/UP once caught up (`OPERATIONS-GUIDE.md` §5–6).

**Evidence this works.** `testing/resilience/disaster-recovery.test.ts` proves the
guarantee end to end: it drives real business activity through a `KnowledgeService`
onto a shared bus, snapshots the live graph, then **simulates total service-state
loss** by discarding the service and all its in-memory repositories — keeping only
the immutable event log — and rebuilds the graph two independent ways:

1. a brand-new projection folded from the log via the kernel `replay` engine
   (`replay(log, graphProjection, …)`), and
2. a fresh `KnowledgeService.buildGraphFromEvents()` service-level fold.

Both reconstruct the graph **identically** to the pre-loss state
(`assert.deepEqual` on a stable node/edge fingerprint), `replay` folds the entire
surviving log, and the test asserts recovery **appended nothing** and left the
history **byte-for-byte unchanged** — recovery never mutates the log. This is the
proof that restoring the log is sufficient to restore all derived state.

### 4.4 Verify the restore

```bash
npm run health           # all services UP, bus healthy, 0 dead letters
npm run demo             # end-to-end lifecycle, replay-rebuilt audit, 0 dead letters
curl -s localhost:8080/metrics   # kmos_events_total should match the restored log size
```

---

## 5. Why projections are safe to discard

The append-only invariant (no `UPDATE`/`DELETE` on `events`) plus the replay engine
means a corrupted or lost projection is never a data-loss event — it is a rebuild.
This is the same mechanism the operations guide uses for routine recovery
(`OPERATIONS-GUIDE.md` §6): drop the projection, replay the log into a fresh one,
swap it in; history is never mutated. Protect the log; regenerate everything else.

---

## 6. References

- **Repository:** `platform/events/src/infrastructure/postgres-event-log.ts`
  (`EVENTS_TABLE_DDL`, `PostgresEventLog`, `SqlClient` port, append-only design),
  `testing/resilience/disaster-recovery.test.ts` (reconstruct-by-replay proof),
  `packages/canonical-kernel` (`replay`), `platform/events` (`EventService`,
  `replayEvents`), `docker-compose.yml` / `deployment/docker/docker-compose.dev.yml`
  (Postgres).
- **ADRs:** [ADR-0009](adr/0009-async-eventlog-kernel-migration.md) (system of
  record / projections; format-stable log),
  [ADR-0001](adr/0001-typescript-postgres-modular-monolith.md),
  [ADR-0003](adr/0003-ports-and-adapters.md).
- **Companion docs:** [`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md) §6–7,
  [`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md),
  [`UPGRADE-GUIDE.md`](UPGRADE-GUIDE.md).
