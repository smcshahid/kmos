# ADR 0011 — Read-model recovery via state-carried events + boot hydration

## Status

**Accepted (implemented).** Closes the final pre-GA engineering blocker identified
in [`engineering/review/18`](../../engineering/review/18-OLARES-DEPLOYMENT-VALIDATION-REPORT.md)
§5–§6: after a restart, repository-backed object detail was not rebuilt from the
durable log (only the event log + search recovered). Complements ADR-0009 (async
EventLog / durable log) and ADR-0010 (Olares deployment). Kernel unchanged.

## Context

KMOS services keep authoritative in-memory repositories that are populated by their
write methods and *also* logged as canonical events. With a PostgreSQL-backed
EventLog (ADR-0009/0010) the **log** survives a restart, but the repositories start
empty — so `GET /knowledge/:id` (object detail), lineage, and other repository-
backed reads returned nothing until the object was written again. The event log is
the system of record, so the read models must be **derivable from it**. The
existing events were "thin": they carried projection data (a graph `node`/`edge`),
not enough to reconstruct the full canonical object.

## Decision

**State-carried events + per-service boot hydration.** No kernel change; existing
ports, contracts, and the event catalog are untouched.

1. **State-carried events.** Every canonical event that creates or updates a
   repository-backed object carries a **full object snapshot** in its (open)
   payload — `object` for a single object, or `objects: CanonicalObject[]` for
   write methods that create several at once (e.g. an Asset register produces
   asset + version + provenance + lineage). This is purely additive; existing
   payload fields (including the graph `node`/`edge` used by projections) are kept.

2. **`hydrate()` per service.** Each service that owns repositories exposes
   `async hydrate(): Promise<void>` that replays the durable log in append order
   and upserts each snapshot into the correct repository by `object.type`,
   **mirroring the write path's own repository method** (put-by-id for latest-wins
   stores; add-then-append-version for versioned stores; add-to-history for
   append-only stores). Because snapshots are applied in log order, head state and
   full version history are reconstructed **identically** to the original writes.

3. **Boot integration.** The composition root's `createPlatformFromEnv` calls
   `hydrate()` on every service after wiring (when backed by a durable log), then
   `search.rebuild()`. Hydration writes directly to repositories and does **not**
   re-publish events, so no duplicate facts enter the log.

## Consequences

- **Restart transparency.** Object retrieval, version history, lineage, search,
  publication/workflow state, and governance queries behave identically before and
  after a restart — verified by per-service rebuild tests (a fresh instance
  hydrated from the same durable log deep-equals the original) and by full
  docker-compose restart-cycle validation.
- **`replicas: 1` can be lifted** where the architecture supports it: read models
  are now a deterministic function of the durable log, so any instance rebuilds the
  same state on boot. (Live in-process fan-out/coordination across replicas remains
  a separate concern; single-node self-hosted is the certified profile.)
- **Cost.** Events are larger (they carry a snapshot). Acceptable: the log is the
  system of record and event-sourcing trades log size for rebuildability. A future
  optimization is periodic snapshots + truncated replay.
- **Discipline.** New repository-backed objects MUST carry an `object`/`objects`
  snapshot on their lifecycle events and be handled in the owning service's
  `hydrate()`; a test must prove restart-identical retrieval.

## Alternatives considered

- **Per-service Postgres repository adapters** (persist repos directly). Rejected:
  duplicates the system of record, and the mandate was to rebuild *from the
  EventLog*.
- **Fatten only creation events.** Rejected: updates/lifecycle transitions change
  state; every state-changing event must carry the resulting snapshot.
- **Re-run write methods on boot.** Rejected: would re-publish events (double-write).

## References

- `engineering/review/18` §5–§6 (the gap); reference impl:
  `platform/knowledge/src/application/knowledge-service.ts` (`hydrate`).
- ADR-0009 (durable async EventLog); ADR-0010 (Olares deployment).
