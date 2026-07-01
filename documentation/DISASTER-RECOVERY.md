# KMOS Disaster Recovery

_How KMOS recovers institutional memory after a loss — the rebuild-by-replay
model, RPO/RTO framing, and the test that proves state is fully reconstructable
from the immutable log._

_Grounded in the repository: the disaster-recovery test
(`testing/resilience/disaster-recovery.test.ts`), the replay engine
(`@kmos/canonical-kernel` `replay`; `EventService.replayEvents`), the Postgres
EventLog adapter (`platform/events/src/infrastructure/postgres-event-log.ts`,
`EVENTS_TABLE_DDL`), and the recovery model in `documentation/OPERATIONS-GUIDE.md`
§6._

_Last updated: 2026-06-30 · Audience: operators, release engineers, on-call._

Companion docs: [`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md) §6 (event-driven
recovery), [`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md) (what/how to back up),
[`UPGRADE-GUIDE.md`](UPGRADE-GUIDE.md). This guide describes procedures and
policy; it does **not** claim a DR event has been rehearsed on production
infrastructure.

---

## 1. The DR model in one sentence

**Institutional memory lives in the append-only event log; every read model is a
projection rebuilt from that log — so if the log survives, the institution
survives.**

- The **event log is the system of record** (durable institutional memory), with a
  real Postgres adapter (`PostgresEventLog` + `EVENTS_TABLE_DDL`) validated by the
  EventLog contract against a real Postgres in CI. History is append-only: no
  `UPDATE`, no `DELETE`.
- **Read models are derived and disposable.** The Knowledge graph, the Search
  index, workflow execution state, and the other projections are rebuilt from the
  log by replay (KMOS-0201 §12; ADR-0009). In this RC they are in-memory
  projections behind ports — reconstructed on start — which makes "rebuild by
  replay" the *normal* path, not just the DR path.

Recovery is therefore not "restore every store from its own backup"; it is
"restore the one durable log, then fold it forward into every projection."

---

## 2. RPO and RTO: operator-set policy tied to log durability

KMOS does not hardcode recovery objectives — **you set them**, and they are bounded
by how durably you protect the event log.

- **RPO (Recovery Point Objective) — how much data you can afford to lose — is
  bounded by the event log's backup/archival lag.** Because the log is the only
  thing that must be durably retained to recover everything else
  (`OPERATIONS-GUIDE.md` §6), your RPO is exactly your event-log durability policy:
  continuous WAL archiving / PITR drives RPO toward near-zero; periodic `pg_dump`
  snapshots give an RPO equal to your snapshot interval
  ([`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md) §3). Projections contribute
  **nothing** to RPO — they hold no un-backed-up truth, since they are regenerable
  from the log.
- **RTO (Recovery Time Objective) — how quickly you must be back — is dominated by
  (a) event-log restore time and (b) replay time to rebuild projections.** Replay
  folds the log from sequence 1; rebuild time scales with the number of events.
  Health returns `Ready`/UP when a service has caught up
  (`OPERATIONS-GUIDE.md` §5–6).

> **No invented numbers.** This guide states no specific RPO/RTO figures — they are
> a policy the operator sets from their backup cadence and acceptable downtime, and
> they depend on real deployment infrastructure (a live PITR-capable database,
> restore bandwidth, log size) that is not present in this environment.

---

## 3. The recovery procedure (rebuild by replay)

The single, uniform recovery procedure — applied whether you lost a projection, a
service instance, or the whole datastore:

1. **Ensure the event log is present and intact.** For a projection or
   service-instance loss, the live log is already there. For a datastore loss,
   restore the log first from backup ([`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md)
   §4.1).
2. **Restore asset bytes** (object storage) if they were lost, and verify against
   the SHA-256 checksums recorded in the log
   ([`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md) §4.2).
3. **Rebuild every projection by replay.** Start the platform; each read model is
   reconstructed by folding the log from sequence 1 via the replay engine
   (`replay(log, projection, …)` / `EventService.replayEvents`). Health flips to
   `Ready` once caught up.
4. **Verify:** `npm run health` (0 dead letters), `npm run demo` (replay-rebuilt
   audit clean), and `GET /metrics` (`kmos_events_total` matches the restored log
   size).

Scenario-specific actions map onto this same procedure
(`OPERATIONS-GUIDE.md` §6.2):

| Scenario | Action | Why it works |
|---|---|---|
| Projection corrupted (graph/index/read model) | Drop it; replay the log into a fresh projection; swap in | Log is untouched; replay is deterministic |
| Service instance lost | Redeploy; it rebuilds read state by replaying its streams | Cores are stateless; state lives in the log |
| Datastore lost | Restore the event log from backup; replay forward | The log is the only thing that must be durably backed up |
| Poison event blocks a consumer | Inspect the dead-letter queue; remediate; never auto-loop | DLQ is for human judgment |

---

## 4. The proof: state is fully reconstructable from the immutable log

The rebuild-by-replay guarantee is not aspirational — it is locked by a test.

`testing/resilience/disaster-recovery.test.ts` ("disaster recovery: knowledge
graph is fully reconstructable by replaying the immutable log"):

1. drives real business activity (three concepts + two relationships) through a
   `KnowledgeService` onto a shared canonical bus, and snapshots the live graph
   (the system of record before any loss);
2. **simulates total service-state loss** — it discards the service and every
   in-memory repository it held, deliberately keeping only the immutable,
   append-only event log, and never reuses the live state for recovery;
3. rebuilds the graph two independent ways — a brand-new projection folded from the
   log via the kernel `replay` engine, and a fresh
   `KnowledgeService.buildGraphFromEvents()` fold — and asserts **both reconstruct
   the pre-loss graph identically** (`assert.deepEqual` on a stable node/edge
   fingerprint), that replay folded the **entire** surviving log
   (`eventsApplied === sizeBefore`), and that recovery **appended nothing** and
   left the history **byte-for-byte unchanged**, with **zero dead letters**.

This is the concrete evidence behind the DR model: after complete loss of derived
state, the full institutional graph is reconstructed purely from the immutable log,
and recovery never mutates history.

> **Honesty note.** This test runs on the in-memory event log and proves the
> **replay-based reconstruction model**. A durable Postgres event log with PITR and
> a rehearsed, timed production DR drill are deployment-time work
> (`OPERATIONS-GUIDE.md` §6.2, roadmap). The reconstruction *mechanism* is proven;
> production RPO/RTO must be measured on real infrastructure, not asserted here.

---

## 5. What protects the guarantee

- **Append-only invariant.** `EVENTS_TABLE_DDL` has no `UPDATE`/`DELETE` path;
  `UNIQUE(stream_id, version)` and the global `sequence` preserve total order.
  Recovery reads the log and writes only projections — never the log.
- **Format stability.** The persisted event format is unchanged across the
  async-kernel migration (ADR-0009 / KEP-001), so old logs replay unchanged — a
  code-level DR (rolling back a bad deploy) strands no data
  ([`UPGRADE-GUIDE.md`](UPGRADE-GUIDE.md) §5).
- **Determinism.** Replay is deterministic (clocks/sinks injected;
  `OPERATIONS-GUIDE.md` §5), so a rebuilt projection equals the original.
- **Protect the log above all.** The binding DR constraint is event-log durability;
  everything else is regenerable ([`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md)).

---

## 6. References

- **Repository:** `testing/resilience/disaster-recovery.test.ts` (the proof),
  `packages/canonical-kernel` (`replay`), `platform/events` (`EventService`,
  `replayEvents`),
  `platform/events/src/infrastructure/postgres-event-log.ts`
  (`EVENTS_TABLE_DDL`, append-only design).
- **ADRs:** [ADR-0009](adr/0009-async-eventlog-kernel-migration.md) (system of
  record; format-stable log),
  [ADR-0002](adr/0002-canonical-kernel-single-source-of-truth.md).
- **Companion docs:** [`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md) §6,
  [`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md),
  [`UPGRADE-GUIDE.md`](UPGRADE-GUIDE.md).
- **Specs:** KMOS-0010 (Replay), KMOS-0190 §22 (disaster recovery), KMOS-0201 §12
  (graph as projection), KMOS-0203 (event replay).
