# KMOS Release Notes

## v1.0.0-rc — Release Candidate (library-grade)

_Date: 2026-06-30_

KMOS — the Knowledge & Media Operating System — reaches its first **Release
Candidate**. The full platform core is implemented and green, and a complete
institutional-knowledge lifecycle runs end-to-end. This is a **library-grade
reference release**: in-process services with programmatic facades and a runnable
demo, not yet a deployed server with a web UI. The precise gap ledger is in
`engineering/IMPLEMENTATION_STATUS.md`.

### Highlights

- **The seven Foundational Institutional Engines** plus **Configuration** and
  **Search**, as in-process services over a single canonical event bus, an
  append-only event log, and deterministic replay.
- **Capabilities -> Domains -> Applications** composition: a reference capability
  library, **5 domain services** (media, language, publishing, preservation,
  ai-collaboration), and thin applications (knowledge-studio, research-portal,
  archive-explorer, administration, public-api, learning-platform).
- **End-to-end demo** (`npm run demo`): organization + identity -> media import
  -> language/knowledge -> governance approval -> publication -> preservation ->
  search -> lineage -> explainable trust -> institutional audit rebuilt by
  replay, with **0 dead letters**.
- **Security enforcement mechanism** at the canonical chokepoint: `CallContext`
  (actor + organization + permissions) and an `Authorizer` (PDP) in the kernel,
  with `EventBus` `requireActor` (rejects unattributed events) and policy-based
  authorization (rejects denied/cross-tenant writes). Backed by a dedicated
  security test suite (CRIT-2 mechanism).
- **Single canonical event catalog** — **97 event types** in the kernel as the
  one source of truth (remediation MED-5); only catalogued types are publishable.
- **Quality gates:** **205 tests, 0 failures** and **0 architecture-fitness
  violations** (131 source files scanned; 26 workspace packages dependency-mapped).
  Suites span unit, contract, event, replay, resilience/DR, schema-migration,
  performance, concurrency, security, integration, and certification.
- **CI pipeline** (`.github/workflows/ci.yml`): `npm ci -> lint -> fitness ->
  typecheck -> test`, the gate for the deferred work below.
- **Docker / compose** deployment assets and a full **documentation suite**
  (Architecture, Developer, Deployment, Security Review, Operations, Capability-
  and Workflow-Development, Troubleshooting, Migration, Release Notes, ADRs).

### Quickstart (Node 22+)

```bash
npm run verify:offline   # architecture-fitness + full test suite (no network)
npm run demo             # end-to-end knowledge lifecycle on the live platform
npm run health           # platform health dashboard
npm run seed             # sample organization with starter knowledge
```
No build, install, or database is required offline: the dev runner executes the
TypeScript sources directly (`--experimental-strip-types` + the `.js`->`.ts`
resolver in `tools/dev/`).

### Metrics

| Metric | Value |
|---|---|
| Tests | 205 passing, 0 failing |
| Architecture-fitness violations | 0 |
| Source files scanned by fitness | 131 |
| Workspace packages dependency-mapped | 26 |
| Canonical event types (single catalog) | 97 |
| End-to-end demo dead letters | 0 |

_The architecture-freeze remediation baseline referenced in
`engineering/review/06-REMEDIATION-CERTIFICATION-REPORT.md` was 201 tests; the RC
demo cycle added suites to reach 205._

### Known limitations / not yet shipped

These are **honestly deferred** to the production cycle and require a networked,
type-checked, database-capable CI/dev environment (see
`engineering/IMPLEMENTATION_STATUS.md` gap ledger):

- **Async EventLog kernel migration (KEP-001).** The kernel `EventLog` port is
  still synchronous; real async storage cannot satisfy the *same* port. This is
  the freeze prerequisite. Plan: `engineering/review/07-KERNEL-EVOLUTION-PLAN.md`.
- **Pervasive identity / attribution.** The enforcement *mechanism* exists and is
  tested, but `CallContext` is not yet threaded through every service write API,
  so automatic attribution is not yet universal. Co-executed with KEP-001 (same
  write paths).
- **Real persistence.** A Postgres `EventLog` adapter + DDL exist behind a
  `SqlClient` port and are contract-tested against an in-memory fake; live
  PostgreSQL with migrations and integration runs needs a real database in CI.
- **Real security infrastructure.** OIDC/JWT, mTLS/SPIFFE, Vault secret backend,
  and encryption-at-rest are designed but not deployed (require running external
  services + network). See `documentation/SECURITY-REVIEW.md`.
- **HTTP API server and reference web UI.** The platform is currently a
  library-grade reference (in-process services + programmatic facades + the
  runnable demo). A clickable, installable server + UI is staged, not built.

### Upgrade path to v1.0.0 (final)

v1.0.0 final is declared by a human board after a single, well-scoped,
**non-redesign** CI cycle:

1. **Complete KEP-001** — convert the kernel `EventLog` port to async and
   propagate `await` everywhere, landed atomically under `tsc` in CI, validated
   against a real Postgres (closes CRIT-1).
2. **Add real persistence** — run the Postgres adapters + migrations against a
   live database (closes the persistence gap).
3. **Enforce security under CI** — thread `CallContext` pervasively, add
   repository tenant scoping, and run a green `npm run verify` (lint + typecheck +
   fitness + full suite) on a networked runner (closes CRIT-2/HIGH-2/HIGH-1).

On a green CI run including real Postgres, the board cuts the **Architecture
Freeze v1.0** and tags `v1.0.0`. The conceptual architecture is considered sound
and is not reopened.

## KMOS v1.0 Platform Hardening (2026-06-30)
- **Runnable HTTP API server** (`@kmos/api-server`, node:http, zero runtime deps) + **reference web UI** (`npm run serve`); REST per KMOS-0180; `KmosError`→HTTP mapping; attribution headers.
- Operability: `GET /health`, `GET /metrics` (Prometheus text). OpenAPI at `documentation/api/openapi.json`.
- Ecosystem: `CONTRIBUTING.md`, `SECURITY.md`, ADR-0006; external-consultancy review (`engineering/review/09`).
- Tests: 205 → **210** (live HTTP suite added); 0 fitness violations.
- Still staged for GA (CI/networked env): async kernel (KEP-001), pervasive identity, real PostgreSQL/OIDC/Vault, real-cluster CI/deploy. See `engineering/review/10-PLATFORM-HARDENING-CLOSEOUT.md`.
