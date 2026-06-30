# KMOS Core v1 — Architecture-Freeze Remediation & Updated Certification

**Role:** Chief Certification Engineer (independent) — remediation cycle
**Date:** 2026-06-30
**Scope authorized:** Architecture-freeze remediation items only. No new features, no service redesign, no scope expansion.
**Baseline before cycle:** 196 tests pass, 0 fitness violations.
**Baseline after cycle:** **201 tests pass, 0 fitness violations** (131 source files; 26 workspace packages dependency-mapped; 0 syntax-check failures across all 131 sources).

---

## 1. Executive outcome

| Freeze-gate item | Severity | Status this cycle |
|---|---|---|
| MED-3 — committed build artifacts | Med | ✅ **Resolved** |
| HIGH-3 — fitness dep-direction near no-op | High | ✅ **Resolved** |
| MED-5 — fragmented event catalog | Med | ✅ **Resolved** |
| CRIT-2 — authn/authz/attribution not enforced | Critical | ◑ **Mechanism delivered & enforced/tested at the canonical chokepoint; pervasive per-service wiring deferred (CI-guarded)** |
| HIGH-2 — tenancy not enforced | High | ◑ **Policy-level enforcement delivered & tested; repository-level scoping deferred (CI-guarded)** |
| CRIT-1 — sync EventLog port unsatisfiable by async storage | Critical | ⏸ **Not landed this cycle — see §2.1. Implemented then reverted to protect the green baseline; requires a type-checked CI environment to complete safely** |
| HIGH-1 — tsc/eslint/CI never run | High | ⏸ **Cannot be executed in this sandbox (no compiler, no network); mitigations applied; must run in CI** |

**Net:** three gate items fully resolved; the two security items have a real, tested enforcement mechanism with the breaking "wire-everywhere" remainder deferred; the two items that are *inherently breaking or environment-bound* (CRIT-1, HIGH-1) are honestly deferred to a networked CI cycle with the work staged.

---

## 2. Per-issue detail (Original → Remediation → Evidence → Residual risk → Freeze impact)

### CRIT-1 — Synchronous kernel `EventLog` port unsatisfiable by async storage
- **Original issue:** The kernel `EventLog` port is synchronous; the Postgres adapter had to implement a *separate* `AsyncEventLog`, so "storage replaceable behind the kernel port" was false for the primary port.
- **Remediation attempted:** I converted the kernel `EventLog` (and `replay`, bus append, and the five service read paths) to async, and made `PostgresEventLog` implement the kernel port directly.
- **What happened:** Making `append` async moves event *dispatch* to a later microtask, which breaks ~21 test files in two ways — (a) reads via the now-async accessors need `await`, and (b) synchronous event-capture tests rely on dispatch completing before the next line. Fully and *correctly* completing this requires making every event-emitting **write** method async and updating all consumers/tests — the exact "breaking change to every consumer" the review predicted.
- **Decision:** With **no offline TypeScript compiler** to guard a refactor of this size, and a confirmed editor file-truncation hazard on large files in this sandbox, completing it blind risked corrupting the certified baseline. I **reverted** the change to keep the suite green (196→back to green) rather than ship an unverifiable, half-migrated kernel or leave tests red (KMOS-9999 "never leave failing tests").
- **Verification evidence:** Suite green after revert; the asynchronous storage contract remains explicitly defined (`AsyncEventLog`) and the `PostgresEventLog` adapter + `EventLog` contract test demonstrate DB-satisfiability of that contract today.
- **Residual risk:** **High and freeze-blocking.** The authoritative in-process port is still synchronous; real async persistence still cannot satisfy the *same* port. This remains a breaking change that a freeze would ossify.
- **Freeze impact:** **Still a blocker.** Must be completed in a networked CI environment where `tsc` guards the async propagation. Estimated ~1–2 days there; mechanical, not a redesign.

### CRIT-2 — Authentication / authorization / attribution not enforced
- **Original issue:** Write APIs took no actor; 0/14 service event emissions set `actorId`; the Identity service was disconnected; the audit trail was anonymous (violates §15, KMOS-0206).
- **Remediation delivered:** Added kernel security primitives `CallContext` (actor + organization + permissions) and `Authorizer` (PDP) in `packages/canonical-kernel/src/security.ts`, and an **enforcement point at the event bus** (the single chokepoint every meaningful change passes through): `EventBus` now supports `requireActor` (rejects unattributed events) and an `authorizer` (rejects policy-denied events). Default is non-enforcing (`ALLOW_ALL`, `requireActor=false`) so it is backward compatible; production composition enables enforcing mode.
- **Verification evidence:** New suite `testing/security/enforcement.test.ts` (5 tests, all pass): unattributed events rejected; policy denial rejected; an authorized actor's id is recorded on the fact (attribution); correlated facts all carry the acting identity; non-enforcing default unchanged. Full suite 201/201.
- **Residual risk:** **Medium.** The *mechanism* is real and enforced/tested, but service write APIs do not yet *require* a `CallContext` by default, so automatic attribution everywhere is not yet pervasive. Threading `CallContext` through every write API is the same class of breaking ripple as CRIT-1 and is deferred to the CI-guarded cycle.
- **Freeze impact:** **Substantially reduced but not fully closed.** The architectural capability exists and is part of the (proposed) frozen contract; the pervasive wiring should land with the CRIT-1 async cycle (both touch the same write paths — do them together).

### HIGH-2 — Multi-tenancy isolation not enforced
- **Original issue:** `organizationId` carried but repositories did not scope by it; cross-tenant reads possible.
- **Remediation delivered:** Tenancy is now enforceable through the same PDP at the chokepoint — a tenant-scoped `Authorizer` rejects cross-organization writes (proven in `enforcement.test.ts`). `CallContext.organizationId` is the kernel-level tenant carrier.
- **Verification evidence:** "tenancy enforced" test (cross-org write rejected; same-org allowed).
- **Residual risk:** **Medium.** Read-path repository scoping (filtering `getX`/`listX` by tenant) is not yet implemented; enforcement today is write/policy-level. Deferred with the CRIT-2 wiring.
- **Freeze impact:** Reduced; repository scoping is an adapter-level change (non-breaking to contracts) and can land post-freeze if the policy-level guard is accepted as the contract.

### HIGH-1 — `tsc` / `eslint` / CI never executed
- **Original issue:** Type-safety and lint were unverified; tests run via type-stripping (erasure, not checking).
- **Remediation in this environment:** No TypeScript compiler or package registry is available offline, so `tsc`/`eslint` **cannot be run here** — this is an environment limitation, not a code choice. Mitigations applied: (a) a best-effort **strip-types syntax check across all 131 source files → 0 failures**; (b) the CI workflow (`.github/workflows/ci.yml`) already runs `npm ci → lint → fitness → typecheck → test`; (c) all remediation code authored to the existing strict conventions.
- **Verification evidence:** 131/131 sources pass `node --check`; 201/201 behavioral tests pass; fitness 0 violations.
- **Residual risk:** **Medium.** Type errors/lint violations could still exist; only a real `tsc`/`eslint` run will confirm.
- **Freeze impact:** **Blocker until a CI run is green.** This is a verification gate, not a redesign — run `npm run verify` on a networked runner.

### HIGH-3 — Architecture-fitness dependency-direction was a near no-op
- **Original issue:** `layerOfPackage()` recognized only the kernel, so cross-layer violations among capabilities/domains/applications were undetected.
- **Remediation delivered:** The fitness checker now **discovers every `@kmos/*` workspace package's owning layer** (from each package.json) and enforces the rank rule for all imports; side-effect (`import 'x'`) imports are now detected too.
- **Verification evidence:** Planted upward import (capability → application) is now caught (`[dep-direction] … imports upward into applications`); clean tree reports `26 workspace packages mapped, 0 violations`. The cross-service (platform↔platform) rule still fires (verified by probe).
- **Residual risk:** Low. The freeze is now guarded by a guard that actually works.
- **Freeze impact:** **Closed.**

### MED-5 — Fragmented event catalog
- **Original issue:** Event types lived in the kernel seed + 5 service-local catalogs + a duplicating platform-catalog (drift risk; violates "one catalog", KMOS-10040).
- **Remediation delivered:** All canonical event types consolidated into the **kernel seed (97 types)** as the single source of truth. Service `create*Catalog()` factories are now idempotent compatibility shims returning the default catalog; `platform-catalog` continues to merge (now a no-op union). (During this change an editor truncation corrupted the assets service file; it was detected and fully reconstructed — see §3.)
- **Verification evidence:** Kernel loads 97 types; all catalog/service tests green; full suite 201/201; fitness clean.
- **Residual risk:** Low. Service-local extra arrays remain as dead-but-harmless compatibility shims; can be deleted later.
- **Freeze impact:** **Closed.**

### MED-3 — Committed build artifacts
- **Original issue:** 5 `dist/` trees committed in source.
- **Remediation delivered:** All `dist/` trees and `*.tsbuildinfo` removed; `.gitignore` already excludes them.
- **Verification evidence:** `find -type d -name dist` → 0.
- **Freeze impact:** **Closed.**

---

## 3. Process note (full disclosure)
During MED-5, the editor's file-write path truncated `platform/assets/src/application/asset-registry-service.ts` (a recurring large-file hazard in this sandbox). It was detected immediately by the test suite ("`unique is not defined`", parse errors), and the lost tail (the `notFound` helper + the `unique` helper + class close) was reconstructed; the assets suite returned to 8/8 and the full suite to green. All large-file edits thereafter were performed via shell here-docs (which do not truncate) rather than the editor. No silent corruption remains (every source passes a syntax check; 201 tests pass).

---

## 4. Updated Architecture-Freeze recommendation

**Recommendation: DO NOT declare Architecture Freeze v1.0 yet. Status upgraded from "premature" to "freeze candidate with two remaining gate items."**

Resolved this cycle: HIGH-3, MED-5, MED-3, and the **security enforcement mechanism** (CRIT-2/HIGH-2 at the policy chokepoint). These materially strengthen the baseline and remove three blockers.

Two blockers remain, both **environment-bound rather than design-bound**, and both are best done together in a networked, type-checked CI environment:
1. **CRIT-1** — complete the async `EventLog` migration (kernel + consumers + tests) under `tsc`.
2. **CRIT-2 / HIGH-2 (pervasive)** — thread the now-defined `CallContext` through service write APIs and add repository tenant scoping (same write paths as CRIT-1 — do in one pass).
3. **HIGH-1** — a green `npm run verify` (lint + typecheck + fitness + test) on a real runner.

These are a single, well-scoped, **non-redesign** cycle (estimated ~3–5 engineer-days in a proper CI). Once green there, KMOS Core v1 should be declared **Architecture Freeze v1.0**. The conceptual architecture remains sound and should not be reopened.

**Independence note:** I again flag that the same agent implemented and reviewed this work; the honest "could not complete CRIT-1 safely offline / reverted to protect the baseline" determination should be confirmed by a human board, and the freeze decision made by that board.
