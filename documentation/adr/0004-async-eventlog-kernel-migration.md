# ADR 0004 — Async EventLog kernel migration (KEP-001)

## Status

**Accepted-plan** (pending CI execution). Authoritative procedure:
`engineering/review/07-KERNEL-EVOLUTION-PLAN.md`. Resolves issue **CRIT-1**
(`engineering/review/06-REMEDIATION-CERTIFICATION-REPORT.md`). Classified as a
kernel migration requiring governance approval before implementation
(KMOS-9999 §20, §28).

## Context

The kernel `EventLog` port is **synchronous**, but real storage (PostgreSQL,
brokers) is asynchronous. The Postgres adapter therefore had to implement a
*separate* `AsyncEventLog` interface, so the authoritative kernel port is not
directly database-satisfiable — "storage replaceable behind the kernel port" is
false for the primary port. A first attempt to convert the port to async was
reverted because, with no offline TypeScript compiler to guard a refactor of this
size (and a file-truncation hazard in the sandbox), completing it blind risked the
certified green baseline.

The non-obvious consequence: making `append` async defers dispatch to a later
microtask, breaking any caller/test that observes state synchronously after a
write.

## Decision

Convert the kernel to **one asynchronous `EventLog` port** that both
`InMemoryEventLog` and `PostgresEventLog` implement, and adopt an
**await-everywhere publication contract**:

- `EventLog` (`append`/`read`/`readStream`/`currentVersion`/`size`) and `replay()`
  become async; `EventBus.publish` awaits append then dispatch.
- Every event-emitting write method becomes `async` and **must `await`** emission;
  **fire-and-forget (`void this.emit/publish`) is prohibited** in `platform/**`
  and `domains/**` and enforced by a new fitness rule.
- The migration lands as **one atomic, `tsc`-guarded merge** (never a half-async
  `main`), validated in CI against a **real Postgres**.
- The persisted event format, the 97-type catalog, and all behavior (validation,
  idempotency, dead-lettering, replay, DR, CRIT-2 enforcement) are unchanged —
  only `await`ed. **No data migration.**

This is taken **pre-freeze on purpose**: after Architecture Freeze v1.0 it would
require the full constitutional migration process.

## Consequences

- Real async storage satisfies the same kernel port (CRIT-1 closed); in-process
  timing matches real storage, making event-capture tests deterministic.
- Breaking change for consumers: in-repo consumers migrate atomically; out-of-tree
  consumers get a deprecated `AsyncEventLog = EventLog` alias (one RC), a
  migration note, and a codemod (`tools/migrate/kep-001-add-awaits.mjs`).
- Co-executed with the CRIT-2/HIGH-2 pervasive `CallContext` wiring and the
  HIGH-1 CI gate (same write paths). Rollback is a single `git revert`, zero data
  risk.
- Until executed, the synchronous port remains the residual freeze blocker; the
  `AsyncEventLog` contract + Postgres adapter already exist as the target.
