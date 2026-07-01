# KMOS Upgrade Guide

_How to upgrade a KMOS deployment across versions without stranding institutional
memory._

_Grounded in the repository: `package.json` scripts, the CI gate
`.github/workflows/ci.yml`, the async-kernel migration (ADR-0009 / KEP-001,
`engineering/review/07-KERNEL-EVOLUTION-PLAN.md`), the type-soundness fix
(ADR-0008), the persisted event format
(`platform/events/src/infrastructure/postgres-event-log.ts`, `EVENTS_TABLE_DDL`),
and the migration rules in `documentation/MIGRATION-GUIDE.md`._

_Last updated: 2026-06-30 · Audience: operators, release engineers, on-call._

Companion docs: [`DEPLOYMENT-GUIDE.md`](DEPLOYMENT-GUIDE.md) (obtain/build/run),
[`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md) (run-time operations),
[`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md),
[`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md), and
[`MIGRATION-GUIDE.md`](MIGRATION-GUIDE.md) (event-schema / kernel migration
mechanics). This guide describes procedures — it does not claim any upgrade has
been performed on production infrastructure.

---

## 0. The invariant that makes upgrades safe

KMOS separates **the system of record** from **everything derived from it**:

- The **append-only event log is the system of record** — the durable institutional
  memory (KMOS-0010 Replay; ADR-0009). It has a real Postgres adapter
  (`PostgresEventLog` + `EVENTS_TABLE_DDL`), validated by the EventLog contract
  against a real Postgres in CI.
- The **read models** — the Knowledge graph, the Search index, workflow execution
  state, and the other projections — are **derived**. They are rebuilt from the
  event log by replay and are *never* the system of record. In this RC they are
  in-memory projections behind ports (no per-service Postgres adapter yet); that
  makes them even cheaper to discard and rebuild.

Because of this split, a code upgrade never has to migrate derived state: you
upgrade the code, then let projections rebuild by replay. The one thing an upgrade
must never break is the **replayability of old event logs** — and, per ADR-0009
and KEP-001, the persisted event format is unchanged across the async-kernel
migration, so **old logs replay unchanged**.

---

## 1. Pre-upgrade checks

Run these before you touch a running deployment. They are the same gates CI runs.

```bash
git fetch --tags
git checkout <target-version>     # e.g. the v1.0.0-rc.1 tag or the target branch

npm ci                            # reproducible install (needs the registry)
npm run verify                    # lint && typecheck && fitness && test — the CI gate
npm run conformance               # certify the reference adapters (contract profiles)
```

If you are on an air-gapped or registry-blocked machine, run the offline subset
instead (it needs no network):

```bash
npm run verify:offline            # fitness && test
```

Checklist before promoting the target build:

- ✅ `npm run verify` (or `verify:offline`) is green on the target version.
- ✅ `npm run conformance` reports **ALL PROFILES COMPLIANT**.
- ✅ You have a **fresh, restorable backup of the event log** (the durable source
  of truth) — see [`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md). Take this
  before any upgrade so rollback and DR both have a known-good log.
- ✅ You have read the target version's [`CHANGELOG.md`](../CHANGELOG.md) entry and,
  if the kernel line changed, the [`MIGRATION-GUIDE.md`](MIGRATION-GUIDE.md) and
  the relevant ADR (0008, 0009).

> **Honesty note.** `lint`, `typecheck`, and `build` need `npm ci` and a reachable
> registry, so they run in CI; `fitness` and `test` run fully offline
> (`OPERATIONS-GUIDE.md` §3.2). `verify:offline` is the local gate when you cannot
> install packages.

---

## 2. Event-schema compatibility: additive-only

The routine, non-breaking way to evolve KMOS is to extend its canonical vocabulary
and event payloads **additively**. This is what lets an upgraded build read logs
written by the old build.

- The Event Service schema registry enforces **BACKWARD** compatibility by default
  (`platform/events/src/domain/schema-registry.ts`). A new schema version for an
  existing event type is accepted only if every payload valid under the old
  version is still valid under the new one. Adding a new **required** field or
  changing an existing field's type is rejected; adding an **optional** field is
  accepted.
- New canonical event **types** are added by appending a `def(...)` entry to the
  single kernel catalog seed
  (`packages/canonical-kernel/src/schema/event-catalog.ts`), never to a
  per-service local catalog.
- **The persisted event format is format-stable.** Per ADR-0009 and KEP-001 the
  async-kernel migration left the persisted format, the 97-type catalog,
  correlation/causation, idempotency, and dead-lettering unchanged — so **there is
  no data migration and old event logs replay unchanged**
  (`documentation/MIGRATION-GUIDE.md` §A, §B.3). ADR-0008's type-soundness fix was
  likewise compile-time only, with no runtime or event-format change.

The regression lock for this rule is
`testing/resilience/event-migration.test.ts`, which proves a v1.0 event still
validates and replays after a BACKWARD-compatible v1.1 schema is registered. Keep
it green across any upgrade that touches schemas.

---

## 3. Upgrade strategies for the modular monolith

KMOS ships today as a **modular monolith** — a single deployable composing all
services in-process (`OPERATIONS-GUIDE.md` §1–2). Two strategies apply; choose per
your durability posture.

### 3.1 Stop-the-world (simplest, recommended for the monolith)

Because a single process holds all services, the straightforward path is:

1. Take a fresh event-log backup (§1).
2. Stop the current process.
3. Deploy the target build.
4. Start the new process. On start it rebuilds its read-model projections from the
   event log by replay; health returns `Ready` once caught up
   (`OPERATIONS-GUIDE.md` §5–6).

This is the natural strategy while the deployable is a single monolith and, today,
while read models are in-memory projections that are reconstructed on start
anyway. Downtime is bounded by process restart + replay time.

### 3.2 Rolling (available once services are extracted)

Rolling upgrades — draining and replacing instances one at a time behind a load
balancer — become meaningful once services are extracted into independently
deployable units (topology Stage 2+, `OPERATIONS-GUIDE.md` §2.1) and read models
are durable rather than rebuilt-on-start. The enabling properties are already in
place: service cores are deterministic and hold no shared mutable state; consumers
are idempotent and delivery is at-least-once, so overlapping old/new instances
processing the same events is safe. The **additive-only** schema rule (§2) is what
makes a rolling upgrade safe: with only backward-compatible changes deployed, an
old instance and a new instance can consume the same log concurrently without
either choking on the other's events.

> **(Roadmap.)** Rolling/blue-green across a cluster, per-service containers, and
> load-balanced drain are deployment-topology work (Stage 2→3); there are no Helm
> charts or Kubernetes manifests in this repository yet
> (`DEPLOYMENT-GUIDE.md` §7). Until then, prefer stop-the-world (§3.1).

---

## 4. Out-of-tree (SDK) consumers: the KEP-001 codemod

In-repo consumers were migrated to the async `EventLog` port atomically (monorepo,
single branch). **Out-of-tree** consumers that referenced the kernel `EventLog`
directly must adapt to the await-everywhere contract (ADR-0009,
`MIGRATION-GUIDE.md` §B.4):

- The `EventLog` port methods (`append`/`read`/`readStream`/`size`/
  `currentVersion`) and `replay()` are now asynchronous; callers must **`await`**
  them and become `async` as needed.
- A deprecated `type AsyncEventLog = EventLog` alias is kept for **one RC** to ease
  the transition; it is removed in v1.1.
- A codemod — `tools/migrate/kep-001-add-awaits.mjs` — inserts `await` at known
  call sites and flags ambiguous ones. Run it against your consumer code, then
  compile: with the async port, every missing `await` is a type error, so `tsc`
  is your completeness check.
- The kernel line bumps to `1.0.0-rc.x` to signal SemVer-major intent.

---

## 5. Rollback

Rollback is a **code** operation, and it strands nothing, because the event log is
format-stable across these versions.

```bash
git revert <upgrade-commit>       # or: git checkout <previous-version> and redeploy
npm ci && npm run verify          # confirm the reverted build is green
# restart the process (stop-the-world) or drain/replace instances (rolling)
```

Why this is safe:

- The async-kernel migration (ADR-0009) landed as **one atomic, `tsc`-guarded
  merge** — never a half-async `main` — so reverting it is a single, clean
  `git revert` with **zero data risk** (`MIGRATION-GUIDE.md` §B.5).
- The **persisted event format is unchanged** across the migration, so the old
  build reads the same log the new build wrote. No event written by the newer
  build is unreadable by the older build, because no breaking format change was
  introduced — only additive, BACKWARD-compatible schema changes are permitted
  (§2).
- Read models are **regenerable by replay** (`DISASTER-RECOVERY.md`), so after a
  code rollback the projections rebuild from the same durable log. Rolling back
  code does not require rolling back data.

The one thing rollback depends on is a durable, uncorrupted event log — which is
exactly why §1 requires a fresh backup before upgrading.

---

## 6. Post-upgrade verification

After the new (or reverted) build is running:

```bash
npm run health           # all services UP, bus healthy, 0 dead letters
npm run demo             # end-to-end lifecycle, rebuilt-by-replay audit, 0 dead letters
curl -s localhost:8080/health           # if running as a server (npm run serve)
curl -s localhost:8080/metrics          # Prometheus text: kmos_events_total, kmos_dead_letters, ...
curl -s localhost:8080/events/metrics   # event metrics (totals, by-type, subscriptions)
```

Confirm: services report `Ready`/UP, `kmos_dead_letters` is `0`, event totals are
consistent with the pre-upgrade log, and the demo's replay-rebuilt audit is clean.
A non-zero dead-letter count is the first signal to investigate
(`TROUBLESHOOTING-GUIDE.md` §8).

---

## 7. References

- **Repository:** `package.json` (scripts), `.github/workflows/ci.yml` (the gate),
  `platform/events/src/infrastructure/postgres-event-log.ts` (`EVENTS_TABLE_DDL`,
  format stability), `packages/canonical-kernel/src/schema/event-catalog.ts`
  (catalog seed), `testing/resilience/event-migration.test.ts` (BACKWARD-compat
  lock), `tools/migrate/kep-001-add-awaits.mjs` (codemod).
- **ADRs:** [ADR-0008](adr/0008-align-canonical-generic-defaults.md) (type
  soundness; no runtime/format change),
  [ADR-0009](adr/0009-async-eventlog-kernel-migration.md) (async EventLog / KEP-001;
  old logs replay unchanged; atomic, revertible),
  [ADR-0004](adr/0004-async-eventlog-kernel-migration.md) (the KEP-001 plan).
- **Companion docs:** [`MIGRATION-GUIDE.md`](MIGRATION-GUIDE.md) (schema + kernel
  migration mechanics), [`DEPLOYMENT-GUIDE.md`](DEPLOYMENT-GUIDE.md),
  [`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md),
  [`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md),
  [`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md), [`CHANGELOG.md`](../CHANGELOG.md).
- **Engineering corpus:** `engineering/review/07-KERNEL-EVOLUTION-PLAN.md` (KEP-001
  authoritative procedure), `engineering/IMPLEMENTATION_STATUS.md` (gap ledger).
