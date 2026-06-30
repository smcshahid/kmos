# ADR 0009 — Asynchronous EventLog kernel migration (KEP-001, resolves CRIT-1)

## Status

**Accepted (implemented).** Merged to `main` as `eb97590` (PR #1); CI green end-to-end including the **database job that runs the EventLog contract against a real PostgreSQL** (`pgvector/pgvector:pg16`). Executes the governed kernel-migration plan in [`engineering/review/07-KERNEL-EVOLUTION-PLAN.md`](../../engineering/review/07-KERNEL-EVOLUTION-PLAN.md) (KMOS-9999 §20/§28). Taken **pre-Architecture-Freeze v1.0** on purpose — the only moment a breaking kernel-port change is an internal refactor rather than a constitutional migration. Supersedes the plan status of ADR-0004 (which proposed this migration). Complements ADR-0002 (kernel as single source of truth) and ADR-0005 (enforced attribution).

## Context

The kernel `EventLog` port was **synchronous**, but real storage (PostgreSQL, brokers) is **asynchronous**. The production `PostgresEventLog` therefore implemented a *separate* `AsyncEventLog` interface — meaning the authoritative kernel port was **not database-satisfiable** (certification finding **CRIT-1**). A prior remediation attempt was reverted because, without a type-checking CI environment, the propagation of `await` across every consumer could not be made safe. That environment now exists (PR-gated `tsc` + ephemeral Postgres).

The non-obvious hazard (which broke the first attempt): making `EventLog.append` async moves the `await` in `EventBus.publish` to *before* dispatch, so any service that emitted fire-and-forget (`void this.emit(...)`) inside a synchronous write would have its event dispatched on a later microtask — breaking every test that observes state synchronously after a write.

## Decision

**KEP-D1 — adopt an await-everywhere publication contract.** The kernel `EventLog` port (`append`/`read`/`readStream`/`size`/`currentVersion`) and `replay()` become asynchronous; `EventBus.publish` awaits the append. Every event-emitting write path becomes `async` and **must `await` publication** — fire-and-forget emission is prohibited and enforced by a new architecture-fitness rule (the sole exception is a constructor, which cannot `await` and must carry an explicit `fitness-allow-fire-and-forget` justification). This makes in-process semantics identical to real async storage and keeps event capture deterministic (no `flush()`/`tick()` hacks).

**KEP-D2 — atomic migration.** Because async propagation cannot be partial in a typed build, the change landed as one reviewed unit gated by green `tsc` + tests + a real-Postgres contract run, never a half-async `main`.

`InMemoryEventLog` and `PostgresEventLog` now implement the **same** async kernel `EventLog`. The separate `AsyncEventLog` interface is deleted (a deprecated `type AsyncEventLog = EventLog` alias is kept for one RC). The persisted event format, the 97-type catalog, correlation/causation, idempotency, dead-lettering, and CRIT-2 enforcement hooks are **unchanged** — no data migration; old logs replay unchanged.

## Consequences

- **CRIT-1 resolved with evidence.** One async port, two adapters; the EventLog contract passes against a **real Postgres** in CI, not only an in-memory fake. The new `PgSqlClient` ships a usable production Postgres wiring behind the `SqlClient` port.
- **HIGH-1 closed.** The migration is guarded by `tsc` (every missing `await` is a compile error), eslint, fitness, and the full test suite — all green in CI.
- **Determinism strengthened.** The await-everywhere contract removes event-capture timing ambiguity; a new publication-ordering test asserts `await publish` resolves only after BOTH append and dispatch (a fire-and-forget dispatch fails it).
- **A latent class of bug was found and fixed.** Adversarial review surfaced six production await-propagation gaps (3 domains, 3 app facades) that a *stale incremental `tsc` build* had masked locally; all were fixed and re-verified under a clean build. Lesson recorded: CI's clean `npm ci` build is authoritative; local incremental builds can hide cross-package drift.
- **Behaviour preserved.** 219/220 tests pass (1 real-PG case runs only in CI); conformance all-profiles compliant; the e2e demo, seed, and health entrypoints pass.
- **Architecture Freeze v1.0 is now eligible** on this axis, pending human board sign-off.

## Alternatives considered

- **Keep a separate async production interface.** Rejected: leaves the authoritative port non-DB-satisfiable — exactly the CRIT-1 defect.
- **Permit fire-and-forget emits and "flush" in tests.** Rejected: non-deterministic, and diverges in-process semantics from real storage.
- **Defer past freeze.** Rejected: post-freeze this becomes a full constitutional migration; pre-freeze it is an internal breaking change.

## References

- Plan: [`engineering/review/07-KERNEL-EVOLUTION-PLAN.md`](../../engineering/review/07-KERNEL-EVOLUTION-PLAN.md). PR: smcshahid/kmos#1.
- ADR-0004 (async EventLog migration — proposed; realized here); ADR-0002; ADR-0005.
- Specs: KMOS-0203, KMOS-0110; governance: KMOS-9999 §20/§28; Coding Constitution §5.
