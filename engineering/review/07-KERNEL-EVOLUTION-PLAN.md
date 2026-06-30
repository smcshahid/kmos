# KMOS Kernel Evolution Plan — v1.0 (KEP-001: Asynchronous Event Log)

**Status:** Plan (no source code modified by this document)
**Author:** Chief Certification Engineer
**Date:** 2026-06-30
**Constitutional classification:** Kernel migration (touches `@kmos/canonical-kernel`, the most-frozen artifact). Requires governance approval before implementation (KMOS-9999 §20, §28).
**Resolves:** CRIT-1 (synchronous `EventLog` port unsatisfiable by async storage). Designed to be co-executed with the CRIT-2/HIGH-2 pervasive wiring and the HIGH-1 CI gate, because all three touch the same write paths.

---

## 0. Problem statement (the ambiguity to eliminate)

The kernel `EventLog` port is **synchronous**. Real storage (PostgreSQL, brokers) is **asynchronous**, so the production adapter implements a *separate* `AsyncEventLog` interface — the authoritative port is not DB-satisfiable. Converting the port to async is mechanically simple but has a **non-obvious semantic consequence** that caused the failed remediation attempt:

> Making `EventLog.append` async moves the `await` in `EventBus.publish` to *before* dispatch. Services that emit with fire-and-forget (`void this.emit(...)`) inside **synchronous** write methods previously had their event appended *and dispatched* before the method returned (because the first `await` in the old `publish` was `await this.dispatch`, after a synchronous append). After the change, dispatch is deferred to a later microtask, so any caller/test that observes state synchronously after a write breaks.

**The single decision that removes the ambiguity (Decision KEP-D1):**
The platform adopts an **await-everywhere publication contract**. Every event-emitting write operation becomes `async` and **must `await` publication**. Fire-and-forget emission (`void this.emit/publish`) is **prohibited** in service/domain write paths and enforced by a new fitness rule. This makes the in-process semantics identical to real async storage and eliminates all timing ambiguity.

---

## 1. Migration design

### 1.1 Target architecture
- `@kmos/canonical-kernel` exposes **one** asynchronous `EventLog` port. `InMemoryEventLog` and `PostgresEventLog` both implement *that same* port. The separate `AsyncEventLog` interface is deleted (replaced by a deprecated type alias `AsyncEventLog = EventLog` for one RC).
- `EventBus.publish` awaits append, then awaits dispatch (unchanged shape; already `async`).
- `replay()` becomes `async`.
- All consumer **read** methods that touch the log/replay become `async`.
- All consumer **write** methods that emit events become `async` and `await` emission.
- Domains/applications that call those now-async methods `await` them.

### 1.2 Publication-ordering contract (normative — removes the timing ambiguity)
`EventBus.publish(event)` resolves **only after**: (1) the event is durably appended to the log (immutable, sequenced), and (2) all matching **in-process** subscribers have been delivered or dead-lettered. Therefore:
- Emitters **MUST `await` publish**. Fire-and-forget is prohibited (lint+fitness enforced).
- For an **out-of-process broker** adapter, "delivered" means "durably handed to the broker"; downstream subscriber delivery is then asynchronous + at-least-once (consumers remain idempotent). This is documented so the contract is stable across in-process and brokered deployments.
- Replay is read-only and never re-appends; replay metadata stays separate (unchanged).

### 1.3 What does NOT change (scope guard)
- The **persisted event format / schema** is unchanged → **no data migration**.
- Canonical objects, the event catalog (97 types), governance/identity/knowledge semantics — unchanged.
- The bus's validation, idempotency dedup, dead-letter, and CRIT-2 enforcement hooks — unchanged in behavior.
- Determinism model (injected clocks), replay-from-log, DR — unchanged in behavior (only `await`ed).

### 1.4 Atomicity decision (Decision KEP-D2)
Because async propagation cannot be partial in a typed build (one async write method forces all callers to await), the migration lands as **one atomic change on a dedicated branch**, internally staged (Section 4) but merged as a single reviewed unit gated by green `tsc` + tests in CI. No "half-async" state is ever merged to `main`.

---

## 2. Interface changes (precise before → after)

### 2.1 Kernel — `packages/canonical-kernel/src/event-bus/append-log.ts`
| Member | Before | After |
|---|---|---|
| `EventLog.append` | `(streamId, event, opts?) => StoredEvent` | `=> Promise<StoredEvent>` |
| `EventLog.currentVersion` | `(streamId) => number` | `=> Promise<number>` |
| `EventLog.read` | `(from?) => readonly StoredEvent[]` | `=> Promise<readonly StoredEvent[]>` |
| `EventLog.readStream` | `(streamId) => readonly StoredEvent[]` | `=> Promise<readonly StoredEvent[]>` |
| `EventLog.size` | `() => number` | `=> Promise<number>` |
| `InMemoryEventLog` | sync impl | `async` impl (bodies otherwise identical) |

### 2.2 Kernel — `replay.ts`
- `export function replay<S>(...) : ReplayResult<S>` → `export async function replay<S>(...) : Promise<ReplayResult<S>>` (awaits `log.read`).

### 2.3 Kernel — `bus.ts`
- `publish`: `const stored = this.log.append(...)` → `const stored = await this.log.append(...)` (already `async`). No signature change. `validateEvent`, `enforce`, `getDeadLetters`, `hasProcessed` unchanged.

### 2.4 Events service — `platform/events/src/infrastructure/postgres-event-log.ts`
- Delete the local `AsyncEventLog` interface; `export type AsyncEventLog = EventLog;` (deprecated alias, removed in v1.1).
- `class PostgresEventLog implements EventLog` (was `implements AsyncEventLog`). Bodies already async — now satisfy the kernel port directly. **This is the core CRIT-1 win.**

### 2.5 Service read methods → async (signatures gain `Promise<…>`)
- `events`: `getEvent`, `getEventHistory`, `getCorrelationChain`, `getCausationChain`, `getEventMetrics`, (`replayEvents` already async — internally `await replay`).
- `knowledge`: `buildGraphFromEvents`.
- `search`: `rebuild`.
- `workflow`: `getExecutionHistory`, `reconstructExecution`.
- `identity`: `getEventHistory`.

### 2.6 Service write methods → async (await emission) — the propagation set
Every public write method that emits a canonical event becomes `async` and `await`s its emit helper; its internal `void this.emit(...)`/`void this.publish(...)` become `await this.emit(...)`. Per service (representative, to be finalized from code during Stage 3):
- `knowledge`: `createKnowledge`, `updateKnowledge`, `createRelationship`, `updateRelationship`, `addVocabulary`, `createCollection`, `advanceLifecycle`, `approve`, `archive`.
- `assets`: already mostly `async` (uses `await this.publish`); audit each `publish` call is awaited (no `void`).
- `governance`: `registerPolicy`, `registerPolicyVersion`, `evaluatePolicy`, `requestApproval`, `grantApproval`, `rejectApproval`, `createReview`, `completeReview`, `grantCertification`, `revokeCertification`, `recordCompliance`, `assessRisk`, `createException`, `closeException`, `assessTrust` (all currently `void this.emit`).
- `identity`: write methods already `async`; convert `void this.emit` → `await`.
- `capability-registry`, `capability-runtime`, `configuration`, `search`, `events`: convert any `void this.(emit|publish)` in write paths to `await` and mark the method `async`.

### 2.7 Domain & application propagation
- `domains/*` and `applications/*` methods that call the now-async service writes/reads `await` them and become `async` as needed (media, language, publishing, preservation, ai-collaboration; public-api, etc.).

### 2.8 New kernel contract test surface
- A single `EventLog` contract (Section 6) replaces the dual sync/async contract.
- A new **publication-ordering** unit test (Section 6) codifies §1.2.

---

## 3. Dependency graph (migration order is bottom-up; merge is atomic)

```
packages/canonical-kernel  (append-log, replay, bus, security)        [Stage 1]
        │  (async EventLog port + async replay)
        ▼
platform/events/infra Postgres adapter  ─ implements kernel EventLog  [Stage 1]
        ▼
platform/* service READ methods (events,knowledge,search,workflow,identity)  [Stage 2]
        ▼
platform/* service WRITE/emit methods (all 10 services)               [Stage 3]
        ▼
domains/* (media,language,publishing,preservation,ai-collaboration)   [Stage 4]
        ▼
applications/* (public-api,…) + engines/platform-catalog users        [Stage 4]
        ▼
testing/** (unit, contract, integration, resilience, performance, security, certification)  [Stage 5]
        ▼
CI: real Postgres contract+integration; tsc/eslint/fitness gates      [Stage 6]
        ▼
(companion) CRIT-2 pervasive CallContext threading on same writes     [Stage 7]
```

**Topological note:** lower layers compile independently; upper layers will not type-check until they `await`. The branch is developed in this order but only merges when the *entire* graph is green.

---

## 4. Implementation stages (single branch `kep-001/async-eventlog`)

- **Stage 0 — Pre-flight (CI must exist first).** Stand up CI with network + `tsc` + `eslint` + an ephemeral Postgres service (closes HIGH-1 as the gate). Branch from the frozen-candidate commit. Add a fitness rule that **forbids `void this.(emit|publish)` in `platform/**` and `domains/**` write paths**.
- **Stage 1 — Kernel async port.** Make `EventLog`/`InMemoryEventLog`/`replay` async; `bus.publish` awaits append. Update `PostgresEventLog implements EventLog`; alias `AsyncEventLog = EventLog`. Kernel unit + contract tests green (async).
- **Stage 2 — Service read paths.** Convert the read/replay methods in §2.5 to async.
- **Stage 3 — Service write/emit paths.** Convert §2.6 write methods to async + `await` emit. This is the largest stage; do one service at a time, compiling continuously (`tsc --build` in CI on the branch).
- **Stage 4 — Domains & applications.** Propagate `await` upward (§2.7).
- **Stage 5 — Tests.** Update all affected test files (~21): `await` read/replay/write calls; for event-capture tests, assert after `await`ing the write (now that dispatch completes before publish resolves, awaited writes make captures deterministic — no `flush()` hack needed). Add the publication-ordering test.
- **Stage 6 — Real-storage validation.** Run the `EventLog` contract test and a slice of integration tests against the **real Postgres** service in CI (validates CRIT-1 end-to-end, not just an in-memory fake).
- **Stage 7 — Companion CRIT-2/HIGH-2 wiring (recommended same branch).** Thread required `CallContext` through the now-async write methods (stamp `actorId`/`organizationId`, call the authorizer); add repository tenant scoping; run reference flows in enforcing mode. Same write paths → cheapest to do together.
- **Stage 8 — Verify + docs + freeze.** Full `npm run verify` green incl. real PG; update `DECISIONS.md` (ADR KEP-001), `OPERATIONS-GUIDE.md`, `CODING-CONSTITUTION.md` (no-fire-and-forget rule), and the event/kernel docs. Then the human board declares Architecture Freeze v1.0.

**Effort estimate (in a proper CI env):** Stages 1–6 ≈ 2–3 engineer-days; Stage 7 ≈ 1–2 days; Stage 8 ≈ 0.5 day. No redesign.

---

## 5. Compatibility strategy

- **Breaking change, taken pre-freeze on purpose.** This is the moment to break the port; after v1.0 freeze it would require constitutional migration review (KMOS-9999 §20). Pre-freeze, it is an internal breaking change.
- **In-repo consumers:** all updated atomically (monorepo). No runtime compatibility layer needed internally.
- **Out-of-tree consumers (future SDK users):** provide (a) `AsyncEventLog = EventLog` deprecated alias for one RC; (b) a one-page migration note "add `await` to EventLog/read/replay and to service write calls"; (c) a codemod script (`tools/migrate/kep-001-add-awaits.mjs`) that mechanically inserts `await` at the known call sites and flags ambiguous ones for human review.
- **Event data compatibility:** none required — persisted event schema, sequence semantics, correlation/causation, and the 97-type catalog are unchanged. Old event logs replay unchanged.
- **API/version compatibility:** bump `@kmos/canonical-kernel` to a pre-1.0 RC line (e.g., `1.0.0-rc.1`); SemVer-major intent recorded.

---

## 6. Test strategy

- **Kernel unit:** async `InMemoryEventLog` (append/read/readStream/size/currentVersion + optimistic-concurrency conflict) and async `replay` (fold + separate session metadata + history-unchanged).
- **Publication-ordering test (new, normative §1.2):** after `await bus.publish(e)`, a subscriber registered before publish has been invoked exactly once; assert the append happened and dispatch completed before the awaited publish resolved. A second test asserts a `void`-style (un-awaited) publish is caught by the fitness rule, not by timing.
- **EventLog contract (single, unified):** `runEventLogContract` executes against `InMemoryEventLog` **and** `PostgresEventLog` backed by (a) the in-memory fake `SqlClient` (fast) and (b) a **real Postgres** service in CI (authoritative). Same assertions; proves one port, two adapters.
- **Replay / DR:** `disaster-recovery.test.ts` rebuilds state by async replay; history unchanged. Re-validate against real PG in CI.
- **Migration / schema:** `event-migration.test.ts` (BACKWARD compat + old-event replay) re-run async.
- **Determinism:** replay reconstruction tests await; assert identical state across two replays.
- **Performance:** `throughput-smoke.test.ts` re-baselined for async (microtask overhead). Budget: publish 5k events < 2s in-memory; record real-PG throughput separately (informational, not a hard gate initially).
- **Security (CRIT-2 companion):** `enforcement.test.ts` + new tests that the reference flows run in enforcing mode with real `actorId` end-to-end.
- **Full regression:** all ~38 suites (currently 201 tests) updated and green; net test count expected to rise (new ordering + real-PG contract).
- **Coverage gate:** maintain or exceed current behavioral coverage of the kernel event path.

---

## 7. CI requirements (also closes HIGH-1)

CI (e.g., GitHub Actions) on the branch and on `main`:
1. `npm ci` (network/registry available — not the offline sandbox).
2. `npm run lint` (eslint) — **must pass** (closes lint half of HIGH-1).
3. `npm run fitness` — incl. the **new rule**: no `void this.(emit|publish)` in `platform/**`/`domains/**` write paths; existing dependency-direction + cross-service + kernel-purity rules.
4. `npm run typecheck` (`tsc --build`) — **must pass** (closes type half of HIGH-1; this is the guard that makes the async refactor safe).
5. Unit + contract + replay + security tests (`node --test`).
6. **Postgres service container** (e.g., `postgres:16` / pgvector): run the `EventLog` contract + an integration slice against the real DB (validates CRIT-1 for real async storage).
7. Schema-compatibility check for canonical event/object schemas (additive-only).
8. Build artifacts excluded from VCS (MED-3 guard); SBOM + (optional) artifact signing.
Branch protection: all of 2–7 required green before merge. No merge on red.

---

## 8. Rollback plan

- **Code-only, zero data risk** (no persisted-format change).
- Development on `kep-001/async-eventlog`; nothing reaches `main` until CI green + board sign-off.
- If post-merge regression: `git revert` the squash-merge commit restores the synchronous kernel exactly (the change set is self-contained: kernel + consumers + tests). Because event data format is unchanged, reverting code does not strand any persisted events.
- Partial-failure safety: since the migration is atomic, there is never a half-migrated `main` to recover from.
- Adapter rollback: the deprecated `AsyncEventLog` alias means a downstream that already moved to the async adapter keeps working after revert (alias resolves to the reverted async/sync type appropriately — documented).

---

## 9. Release plan

1. Governance approval of this KEP (KMOS-9999 §20 kernel migration review).
2. Stage 0 CI established; branch cut.
3. Implement Stages 1–8 on branch; CI green incl. real Postgres.
4. Independent (human) review of the diff + this plan’s acceptance criteria.
5. Merge → tag **`v1.0.0-rc.1`**. Soak window (run reference flows; monitor).
6. If clean, the board declares **Architecture Freeze v1.0** and tags **`v1.0.0`**; `DECISIONS.md` records the freeze + KEP-001 as accepted.
7. Publish CHANGELOG + migration note + codemod for any out-of-tree consumers.
8. Post-freeze: any further kernel change requires the §20 migration process.

---

## 10. Acceptance criteria (definition of done — all required)

1. **One async port:** `EventLog` is asynchronous; `InMemoryEventLog` **and** `PostgresEventLog` implement the *same* kernel `EventLog`. No separate production interface (only the deprecated alias).
2. **Real-DB proof:** the `EventLog` contract test passes against a **real Postgres** in CI (not only the in-memory fake).
3. **Publication-ordering contract** (§1.2) documented and covered by tests; **no fire-and-forget** emits remain in `platform/**`/`domains/**` (fitness rule passes).
4. **Green verify:** `npm run verify` (eslint + `tsc` + fitness + full test suite) passes in CI — closing HIGH-1.
5. **Behavior preserved:** replay, disaster-recovery, schema-migration, determinism, idempotency, dead-letter, and CRIT-2 enforcement tests all pass; performance within stated budget.
6. **No data migration / reversible:** persisted event format unchanged; documented `git revert` rollback validated on the branch.
7. **Docs updated:** ADR KEP-001 in `DECISIONS.md`; `CODING-CONSTITUTION.md` (no-fire-and-forget), `OPERATIONS-GUIDE.md`, kernel/event docs; `IMPLEMENTATION_STATUS.md` reflects CRIT-1 resolved.
8. **Companion (if co-merged):** CRIT-2 pervasive `CallContext` threading + repository tenant scoping green; reference flows run enforcing.
9. **Sign-off:** independent human board approves; tags cut per Section 9.

On satisfying 1–9, **CRIT-1 is closed**, HIGH-1 is closed, CRIT-2/HIGH-2 are closed (if companion included), and KMOS Core is eligible for **Architecture Freeze v1.0**.

---

### Appendix A — Affected-file inventory (from current source)
Kernel (3): `event-bus/append-log.ts`, `event-bus/replay.ts`, `event-bus/bus.ts`.
Events infra (1): `infrastructure/postgres-event-log.ts`.
Service read paths (5 files): events, knowledge, search, workflow, identity.
Service write/emit paths (≈10 services): knowledge, assets, governance, identity, capability-registry, capability-runtime, workflow, configuration, search, events.
Domains (5) + applications (≈6) + engines/platform-catalog consumers.
Tests (~21 of 38 suites) touching `eventLog.read/size/readStream/currentVersion`, `replay(`, the async read methods, or synchronous event capture.

### Appendix B — Risks & mitigations specific to this migration
- **R1 Hidden sync assumption in a consumer** → `tsc` makes every missing `await` a compile error (this is why HIGH-1/CI is a prerequisite, not optional).
- **R2 Event-capture test flakiness** → eliminated by KEP-D1 (await-everywhere): captures are asserted after the awaited write, deterministically.
- **R3 Performance regression from microtasks** → re-baseline perf test; budget set; real-PG numbers recorded separately.
- **R4 Large-file edit hazard (observed in sandbox)** → perform edits in a normal dev/CI checkout (not the FUSE sandbox); verify each file via `tsc` + syntax check.
- **R5 Scope creep into redesign** → guardrails: no behavior change beyond sync→async; fitness + review enforce it.
