# KMOS v1.0.0-rc — Certification Refresh (independent)

**Role:** Engineering Director + independent certification
**Date:** 2026-06-30
**Scope:** Re-certify the platform as a **v1.0.0-rc (library-grade) Release Candidate** after the RC mission, and restate the path to v1.0.0 final.

## 1. Verification evidence (re-run this cycle)
- `npm run verify:offline` → architecture-fitness **OK, 0 violations** (131 source files, 26 packages); **205 tests, 205 pass, 0 fail**.
- `npm run demo` → full knowledge lifecycle completes end-to-end (88 canonical events, **0 dead letters**, explainable trust 0.71/TRUSTED).
- `npm run health` → all 9 services UP, bus healthy.
- `npm run seed` → sample organization + knowledge + asset created.
- **User Acceptance Test:** a new engineer following only `documentation/GETTING-STARTED.md` reaches a green verify, a working demo, health, and seed with **no undocumented step**. ✅

## 2. What this RC delivers
- Seven foundational engines + Configuration + Search; capabilities → domains → applications; reference capability library; 6 applications.
- Single 97-type canonical event catalog (one source of truth); append-only log; replay; security enforcement mechanism (CallContext/Authorizer; attribution/authorization/tenancy) with a dedicated security suite.
- Runnable end-to-end reference demo; seed + health DX scripts; one-command offline verification.
- Full CI pipeline (static, tests, real-Postgres database job); Dockerfile + docker-compose; complete documentation suite (Architecture, Developer, Deployment, Security, Operations, Capability-Dev, Workflow-Dev, Troubleshooting, Migration, Getting-Started, Release Notes, 5 ADRs).
- Test corpus: unit, contract (incl. EventLog port vs in-memory + Postgres-fake), event, replay, resilience/DR, migration, performance, concurrency, security, integration, certification.

## 3. Conformance
- **Architecture conformance:** PASS. Layering, single object ownership, dependency direction (now enforced across all layers), no cross-service imports, ports-and-adapters — all green via fitness + tests. No architecture was redesigned.
- **Constitutional conformance:** SUBSTANTIAL. Knowledge/evidence/events/capabilities/workflow/governance invariants upheld and demonstrated. Security §15 has an enforced *mechanism* at the chokepoint; pervasive per-write enforcement is staged (CRIT-2 wiring) with the kernel migration.

## 4. Remaining risks / not shipped (honest)
- **CRIT-1 async EventLog** (freeze prerequisite) — staged; execute under CI per KEP-001 (`engineering/review/07`).
- **HIGH-1** — `tsc`/`eslint` cannot run in this sandbox; the CI pipeline runs them. Type-safety is unverified until a CI run.
- Pervasive identity threading; real PostgreSQL persistence; real OIDC/JWT/mTLS/SPIFFE/Vault/encryption; HTTP API server; web UI — all require a networked/DB/browser environment and are roadmap.

## 5. Release recommendation
- **Declare KMOS v1.0.0-rc (library-grade).** It is installable, runnable, evaluable, and extensible by a new engineer via documentation alone, with a green suite and a working end-to-end demo.
- **Do NOT declare Architecture Freeze v1.0 yet.** Freeze after KEP-001 + pervasive identity + real persistence/security land green in CI (one well-scoped, non-redesign cycle).
- Independence caveat stands: the same agent built and certified this; a human board should ratify before any freeze.
