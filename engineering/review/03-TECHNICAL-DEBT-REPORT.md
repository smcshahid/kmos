# KMOS Core v1 — Technical Debt Report

**Reviewer:** Chief Certification Engineer (independent)
**Date:** 2026-06-30
Each item: evidence → impact → remediation → severity. Severity reflects risk to the *permanent baseline*, not feature completeness.

---

## CRIT-1 — Synchronous kernel `EventLog` port is unsatisfiable by real storage
- **Evidence:** `packages/canonical-kernel/src/event-bus/append-log.ts` declares synchronous `EventLog`; `replay.ts` and `bus.ts` consume it synchronously; ~5 services call `bus.eventLog.read(1)` synchronously. The Postgres adapter implements a *separate* `AsyncEventLog` (`postgres-event-log.ts` line 58/124), not the kernel port.
- **Impact:** No real (async) database can back the event log without changing the kernel. Replacing this post-freeze is a breaking change to the kernel + replay + bus + every consumer. Directly falsifies "storage replaceable behind the kernel port."
- **Remediation:** Make the kernel `EventLog` (and the read paths in `replay`/bus/services) `async`/`Promise`-based now, while consumers are few. Re-run the EventLog contract test against both adapters. ~0.5–1.5 days; mostly mechanical but touches the kernel.
- **Severity: Critical (pre-freeze).**

## CRIT-2 — Authn/authz/attribution not enforced; `actorId` never populated
- **Evidence:** Write APIs take no actor (`createKnowledge(input)`, `registerAsset(input)`, `requestApproval(input)`). 0 of 14 service `createEvent` calls set `actorId`. Only `domains/ai-collaboration` sets one (the AI worker). No service calls Identity's `authenticate`/`authorize`.
- **Impact:** Constitutional §15 violation; anonymous audit trail; no tenant/actor enforcement; security model is designed but inert.
- **Remediation:** Introduce a small `CallContext { actorId, organizationId, authz }` threaded into write APIs; have services require it, call the authorization port, and stamp `actorId`/`organizationId` on emitted events. Add boundary authz tests. Changes API signatures → do before freeze. ~1–2 days.
- **Severity: Critical (pre-freeze).**

## HIGH-1 — `tsc`, `eslint`, and CI have never executed
- **Evidence:** No `node_modules`; npm registry blocked (E403); tests run only via `node --experimental-strip-types` (type *erasure*, not type *checking*). No git repo on the mount → the CI workflow has never run.
- **Impact:** "Strict TypeScript", "typecheck passes", and "CI green" are **unverified**. Latent type errors and lint violations may exist. Certification evidence is weaker than presented.
- **Remediation:** Run `npm ci && npm run typecheck && npm run lint` in a networked environment (or commit to a real git host so CI runs) and fix anything surfaced. This is a *verification* gap, not necessarily a code defect — but it must be closed before claiming production readiness. ~0.5 day once network/CI available.
- **Severity: High.**

## HIGH-2 — Multi-tenancy isolation not enforced at the data layer
- **Evidence:** `organizationId` is carried on objects/events, but in-memory repositories do not filter by it; only `search`'s `AccessFilter` checks org. `getKnowledge`/`getAsset` return any tenant's object.
- **Impact:** Cross-tenant data exposure; KMOS-0009 logical separation unmet.
- **Remediation:** Add org scoping to the repository port (read/list scoped by `organizationId` from the call context) and enforce in adapters; add isolation tests. ~1 day.
- **Severity: High.**

## HIGH-3 — Architecture-fitness dependency-direction check is a near no-op
- **Evidence:** `tools/fitness-checks/run.mjs` `layerOfPackage()` recognizes only `@kmos/canonical-kernel`; all other `@kmos/*` imports return `undefined`, skipping the rank check. The cross-service (platform↔platform) rule does work (verified by a planted probe).
- **Impact:** A central certification guarantee ("dependency direction enforced") is overstated; future cross-layer violations between capabilities/domains/applications would pass undetected.
- **Remediation:** Resolve every `@kmos/*` import to its owning layer (scan workspace dirs) and apply the rank rule generally. ~0.5 day. Should land before freeze so the freeze is guarded by a real guard.
- **Severity: High.**

## MED-1 — Idempotency dedup is unbounded and non-durable
- **Evidence:** `bus.ts` keeps `processed: Map<subscriber, Set<eventId>>` in memory forever; lost on restart.
- **Impact:** Unbounded memory growth for a long-running platform; after restart, at-least-once redelivery can double-process (violates the idempotency guarantee across restarts).
- **Remediation:** Back dedup with the durable store (inbox table) and/or bound it; document the production design. Acceptable for the in-memory reference but must be flagged. ~0.5–1 day at adapter time.
- **Severity: Medium.**

## MED-2 — Dead-letter "exponential backoff" is not implemented
- **Evidence:** `bus.ts deliver()` retries in a tight `while (attempts < maxAttempts)` loop with no delay/jitter/scheduling; comments and prior reports imply backoff.
- **Impact:** Misleading capability claim; in production this would hammer a failing consumer. Functionally fine in-memory.
- **Remediation:** Implement scheduled retry with backoff+jitter in the broker adapter; correct the documentation. ~0.5 day.
- **Severity: Medium.**

## MED-3 — Build artifacts committed in the source tree
- **Evidence:** 5 `dist/` directories present (`canonical-kernel`, `capability-runtime`, `events`, `knowledge`, `workflow`), including stale `.d.ts` that appeared in grep results.
- **Impact:** Tree noise; risk of stale artifacts shadowing source; `.gitignore` covers them but they exist on disk and could be imported by mistake.
- **Remediation:** Delete `dist/` from the tree; ensure builds emit outside source or are cleaned. ~5 min.
- **Severity: Medium (hygiene).**

## MED-4 — Determinism leaks (non-injected clocks)
- **Evidence:** `platform/events/src/domain/subscriptions.ts` uses `new Date()` for `updatedAt`; `bus.ts` dead-letter timestamp uses `new Date()`; some governance/identity time math uses `new Date(...)` directly.
- **Impact:** Minor non-determinism in a domain object's `updatedAt` and operational records; weakens "fully deterministic core" claim.
- **Remediation:** Thread the injected `now()` into these paths. ~0.5 day.
- **Severity: Medium.**

## MED-5 — Fragmented event-type vocabulary
- **Evidence:** Event types defined in kernel seed + 5 per-service local catalogs + `engines/platform-catalog` (duplicating list). KMOS-10040 wants one catalog.
- **Impact:** Drift risk; the merged catalog is hand-maintained; a service can register a type the kernel doesn't know.
- **Remediation:** Promote all canonical event types into the kernel catalog; have services reference, not re-declare. ~1 day. Recommended before freeze (the catalog is part of the frozen contract).
- **Severity: Medium.**

## LOW-1 — Repositories return live internal references
- **Evidence:** In-memory repos return stored objects directly; canonical types are `readonly` at compile time but mutable at runtime.
- **Impact:** A caller could mutate shared state; masked today by discipline + type-stripping (no runtime enforcement).
- **Remediation:** Freeze/clone on read in adapters, or rely on persistence boundaries in production. ~0.5 day.
- **Severity: Low.**

## LOW-2 — Three platform specs are agent-authored drafts
- **Evidence:** KMOS-0208/0209/0210 are drafts in `engineering/draft-specs/`.
- **Impact:** Part of the frozen surface would rest on unratified specs.
- **Remediation:** Governance review (see doc 05). 
- **Severity: Low (process).**

## Debt summary
| Severity | Count | Must fix before Freeze v1.0? |
|---|---|---|
| Critical | 2 | **Yes** (CRIT-1, CRIT-2) |
| High | 3 | HIGH-1 & HIGH-3 yes; HIGH-2 strongly recommended |
| Medium | 5 | MED-5 yes (frozen contract); others can be RC-window |
| Low | 2 | No (track) |

**Total estimated pre-freeze remediation: ~5–8 focused engineer-days.** None of it is a redesign; all of it is contract/enforcement hardening on an otherwise sound core.
