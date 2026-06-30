# 11 — KMOS Repository Audit (Production-Readiness & Source-Control Governance)

_Author: Principal Engineer (repository audit)._
_Date: 2026-06-30 · Baseline: v1.0.0-rc.1 · Audience: release owner, engineering leadership._

This is an evidence-based audit of the KMOS monorepo as it stands on disk. Every
finding below was gathered with shell commands against the live repository (no
assumptions). It evaluates organization, documentation, architecture, dependencies,
configuration, versioning, licensing, release readiness, cleanliness, and remaining
technical debt. **No source code or tests were modified to produce this report.**

Scope note: this audit was run inside the documented sandbox (a FUSE mount with no
`git`, no npm registry, no `tsc`/`eslint`, no database — see `engineering/KNOWN_ISSUES.md`
E-01/E-02). Offline gates (`fitness` + `node:test`) were executed; network gates
(`lint`/`typecheck`) are CI-only and were not run here.

---

## 0. Audit summary

| # | Dimension | Status |
|---|---|---|
| 1 | Repository organization | **Pass** |
| 2 | Documentation quality | **Improve** (consolidation opportunities) |
| 3 | Architectural consistency | **Pass** (fitness 0 violations) |
| 4 | Dependency management | **Pass** (zero third-party runtime deps) |
| 5 | Configuration consistency | **Improve** (one stray `vitest` test script) |
| 6 | Versioning consistency | **Pass** (29/29 at 1.0.0-rc.1) |
| 7 | Licensing readiness | **Defer** (owner decision: UNLICENSED, no LICENSE file) |
| 8 | Release readiness | **Pass for RC**, not GA |
| 9 | Repository cleanliness | **Pass** (no build cruft; 4 empty dirs noted) |
| 10 | Remaining technical debt | **Defer** (CI-gated; tracked) |

Overall: the repository is **organized, consistent, and clean to release-candidate
standard.** The remaining items are documentation consolidation, one configuration
nit, a licensing decision, and the previously-documented GA prerequisites (async
kernel, real persistence, real authn/authz) that are explicitly deferred to a
networked CI environment.

---

## 1. Repository organization

**FINDINGS.**
- Top level is clean and intentional: `packages/ platform/ engines/ capabilities/
  domains/ connectors/ applications/ sdk/` (the workspace tiers), plus
  `specifications/ reference/ constitution/ documentation/ engineering/` (docs),
  `testing/ tools/ scripts/ examples/ deployment/` (build/run), and
  `architecture/ extensions/ governance/` (scaffolding).
- `find ... -name package.json` → **29** `package.json` files: 1 root + **28**
  workspace packages.
- Layer membership matches the root `workspaces` globs exactly:
  `packages(2) platform(10) engines(2) capabilities(1) domains(5) connectors(1)
  applications(7) sdk(0)`. The `sdk/*` glob is declared for future packages and
  currently holds only a README — a deliberate, documented placeholder.
- The four scaffolding directories (`architecture/ extensions/ governance/ sdk/`)
  each carry a `README.md` explaining their intended contents and pointing to the
  authoritative location today (e.g. `sdk/README.md` → `packages/conformance`;
  `architecture/README.md` → `documentation/adr/`).

**STATUS: Pass.**

**RECOMMENDATION.** Keep the tiered layout. The `engineering/` (working history) vs
`documentation/` (product docs) separation is clean (see §2). No reorganization is
warranted for RC.

---

## 2. Documentation quality

**FINDINGS.**
- Product documentation lives under `documentation/` (12 guides + `adr/` with 7 ADRs
  + README + `api/openapi.json`). It covers architecture, getting-started, developer,
  capability/workflow development, conformance, deployment, operations, migration,
  troubleshooting, security review, and release notes — a complete suite.
- Engineering working history lives under `engineering/` (status, decisions, known
  issues, next-task, two readiness/certification reports, `draft-specs/`, and a
  `review/` series 00–10). The separation between product docs and working history
  is **clean** — no working-history files leak into `documentation/`.
- Normative specifications live under `specifications/` (`.docx`/`.pdf`, the KMOS-00xx
  / 01xx / 02xx families) and `reference/` (`.docx`/`.pdf` dossiers/catalogs); the
  `constitution/` holds the coding constitution and charter. Source of truth for the
  architecture is correctly anchored there, not in derived markdown.

**Duplication / consolidation opportunities (evidence).**
- **Certification reports overlap.** Four artifacts narrate certification at different
  points in time: `engineering/KMOS-CERTIFICATION-REPORT.md` (M6),
  `review/00-CERTIFICATION-REVIEW-SUMMARY.md`, `review/06-REMEDIATION-CERTIFICATION-REPORT.md`,
  and `review/08-RC-CERTIFICATION-REFRESH.md`. These are point-in-time records (a
  legitimate audit trail), but a reader has no single "current certification status"
  entry point. Consolidation opportunity: a short index at the top of `review/`
  pointing to the latest authoritative certification (currently 08 + 10), with the
  earlier ones explicitly marked "superseded — historical."
- **Operations vs Deployment overlap.** `documentation/OPERATIONS-GUIDE.md` is titled
  "Operations, **Deployment** & Disaster-Recovery Guide" and `documentation/DEPLOYMENT-GUIDE.md`
  covers "obtain, build, verify, run … production-deployment roadmap." The two
  overlap on deploy/verify. Consolidation opportunity: make DEPLOYMENT-GUIDE the
  single source for "how to deploy" and have OPERATIONS-GUIDE cross-reference it for
  the deploy step rather than re-describing it.
- **Stale headline numbers.** Test counts drift across documents: RELEASE-NOTES cites
  "205 tests," IMPLEMENTATION_STATUS "201," 10-PLATFORM-HARDENING "210," while the
  live suite now reports **217** (see §3/§8). These are honest snapshots from
  different cycles, but they should be reconciled to one number at release tag.

**STATUS: Improve.**

**RECOMMENDATION.** (a) Add a one-screen `engineering/review/README.md` index that
states the current authoritative certification and marks superseded reports. (b)
De-duplicate the deploy material between OPERATIONS and DEPLOYMENT guides via
cross-reference. (c) Reconcile test/fitness counts to the live numbers at the RC tag.
None of these are release-blocking.

---

## 3. Architectural consistency

**FINDINGS.**
- `npm run fitness` →
  `KMOS architecture-fitness: OK (142 source files scanned, 28 workspace packages
  mapped, 0 violations).` Dependency-direction and side-effect-import rules pass
  across every `@kmos/*` layer.
- The four-layer source convention (`domain/ application/ infrastructure/`, plus
  `api/` where applicable) is present and consistent across platform services
  (e.g. `platform/identity/src/{domain,application,infrastructure}`).
- ADR coverage exists for the load-bearing decisions: ports-and-adapters (0003),
  canonical kernel single-source-of-truth (0002), async EventLog migration (0004),
  enforced attribution/authorization (0005), HTTP API + reference UI (0006),
  conformance kit (0007).

**STATUS: Pass.** Architecture is enforced by an automated gate, not just by
convention — the strongest possible posture for a reference implementation.

**RECOMMENDATION.** Keep `npm run fitness` in the offline gate and CI (it already is).
No action required.

---

## 4. Dependency management

**FINDINGS.**
- npm **workspaces** drive the monorepo; every internal edge is a `@kmos/*` dependency
  pinned to `"*"` (workspace resolution), e.g. all 28 packages depend on
  `@kmos/canonical-kernel`; `applications/api-server` composes 16 internal packages.
- **Zero third-party runtime dependencies.** Auditing every non-root `package.json`
  `dependencies` block shows only `@kmos/*` entries — no external runtime libraries
  anywhere. The kernel uses a hand-written zero-dependency schema validator (TD-02).
- The only third-party packages are **dev** dependencies at the root
  (`typescript`, `eslint`, `@typescript-eslint/*`, `@types/node`) — toolchain only.
- The dependency graph is acyclic and direction-correct (proven by §3 fitness).

**STATUS: Pass.** The zero-runtime-dependency posture is excellent for a reference
implementation: minimal supply-chain surface, trivial auditability.

**RECOMMENDATION.** Preserve the zero-runtime-dep posture as an explicit invariant
(it is already implied by fitness). When real adapters land (Postgres `pg`, OIDC),
introduce them strictly behind the existing ports and document each addition.

---

## 5. Configuration consistency

**FINDINGS.**
- `tsconfig.base.json` is strict and modern (ES2022 / NodeNext, `strict`,
  `noUncheckedIndexedAccess`, `composite`, declaration maps). Shared correctly.
- Root `tsconfig.json` is a solution file with **28** project references; these match
  the 28 workspace packages **exactly** (verified one-to-one). No missing or stray
  reference.
- `eslint.config.mjs` is a flat config ignoring `dist/`, `node_modules/`,
  `*.tsbuildinfo`, and `engineering/_extracted/`; rules are sensible
  (`no-unused-vars` with `_` ignore, `eqeqeq`, `prefer-const`). Architecture rules
  are correctly delegated to fitness, not eslint.
- `.gitignore` covers `node_modules/ dist/ *.tsbuildinfo coverage/ .env* *.log
  .DS_Store` and the transient `engineering/_extracted/`. Appropriate.
- Root `scripts` are coherent: `build/clean` (tsc -b), `lint`, `typecheck`,
  `fitness`, granular `test:*` targets, `verify` (full) and `verify:offline`
  (fitness + tests), plus `demo/seed/health/serve/conformance`.

**Inconsistency found.** `packages/canonical-kernel/package.json` still declares
`"test": "vitest run"` — the **only** package whose test script references `vitest`.
Every other package uses `node --experimental-strip-types … --test test/*.test.ts`,
and `vitest` is not a dependency anywhere in the repo. The kernel's tests do execute
(they are picked up by the root `test` glob via `node:test`), so this is **not** a
functional failure — but it is a stale stub that misleads anyone running the package
script directly and is inconsistent with the rest of the monorepo.

**STATUS: Improve.**

**RECOMMENDATION.** Align `packages/canonical-kernel` `test` script to the standard
`node --experimental-strip-types --import ../../tools/dev/register.mjs --test
test/*.test.ts`. One-line change; not release-blocking but should land at the RC tag.
(Per-package change requires touching source config, intentionally left for the owner
to apply alongside the commit plan in `12-SOURCE-CONTROL-COMMIT-PLAN.md`.)

---

## 6. Versioning consistency

**FINDINGS.** `grep -rh '"version"' --include=package.json` across all
non-`node_modules` manifests →
```
     29   "version": "1.0.0-rc.1",
```
All 29 manifests (root + 28 workspaces) are at **1.0.0-rc.1**. No drift.

**STATUS: Pass.**

**RECOMMENDATION.** Bump in lockstep across all 29 for every release (rc.2 → 1.0.0).
Consider a `version` script that fails CI if any manifest diverges.

---

## 7. Licensing readiness

**FINDINGS.**
- Root `package.json` declares `"license": "UNLICENSED"` and `"private": true`.
- **No `LICENSE` file** exists at the repository root (`ls LICENSE*` → none).
- `SECURITY.md`, `CONTRIBUTING.md`, `README.md`, and `CLAUDE.md` are present; the
  licensing decision is explicitly flagged as an owner action in
  `engineering/review/10-PLATFORM-HARDENING-CLOSEOUT.md` ("LICENSE decision
  (currently UNLICENSED — owner)").

**STATUS: Defer (owner decision required).**

**RECOMMENDATION.** This is a business/legal decision, not an engineering one — the
audit does **not** pick a license. Present the owner with the standard options:
- **Open source — permissive (e.g. Apache-2.0):** broadest adoption, explicit patent
  grant, suitable if KMOS is meant as a public reference implementation. Add
  `LICENSE` + per-file SPDX headers + `NOTICE`.
- **Open source — copyleft (e.g. AGPL-3.0):** keeps networked derivatives open;
  appropriate if reciprocity is desired for a hosted platform.
- **Proprietary / source-available (e.g. BUSL-1.1 or a commercial EULA):** retains
  control/monetization; keep `"private": true` and add a proprietary LICENSE.
Whichever is chosen: replace `"UNLICENSED"` with the SPDX identifier, add the
`LICENSE` file, and (for OSS) add a `NOTICE` and SPDX headers. Until decided,
`"UNLICENSED" + private:true` is the correct safe default and is **not** an error.

---

## 8. Release readiness

**FINDINGS.**
- Offline quality gate is green now:
  - `npm test` → **217 tests, 217 pass, 0 fail** (live run this audit).
  - `npm run fitness` → **0 violations** (142 files, 28 packages).
- CI is defined (`.github/workflows/ci.yml`): three jobs — `static`
  (lint/fitness/typecheck), `tests` (unit/contract/security/integration/perf/
  certification/conformance/demo), and `database` (real PostgreSQL service for the
  async EventLog path). The networked gates (`lint`, `typecheck`, DB) are CI-only by
  design (sandbox cannot run them — E-01/E-02).
- Deployment assets exist: root `Dockerfile`, `docker-compose.yml`,
  `deployment/docker/docker-compose.dev.yml`. (`deployment/ci/` is an empty
  placeholder — see §9.)
- RELEASE-NOTES.md honestly frames this as a **library-grade reference release**, not
  a deployed GA system, and points to the gap ledger.

**STATUS: Pass for Release Candidate. Not GA.** The closeout report
(`10-PLATFORM-HARDENING-CLOSEOUT.md` §8) correctly withholds GA promotion pending the
async kernel, real persistence, real authn/authz, and full CI (incl. DB) — all of
which require a networked environment.

**RECOMMENDATION.** Cut the RC by (a) verifying `npm run verify` green in CI
(the only gate not runnable here), (b) reconciling doc test-counts to 217, (c)
applying the §5 vitest fix, then tag `v1.0.0-rc.1` (see commit plan). Hold GA for the
documented prerequisites.

---

## 9. Repository cleanliness

**FINDINGS.**
- **No build cruft.** `find` for `*.tsbuildinfo`, `*__probe*`, and `dist/` directories
  returns **none**. No committed compiled output.
- **No stray temp files.** `*.tmp / *.bak / *~ / .DS_Store` → none.
- **Empty directories (4), all intentional placeholders:**
  - `architecture/adr/` — empty; ADRs currently live in `documentation/adr/` (the
    `architecture/README.md` says so). Overlap with the populated `documentation/adr/`.
  - `deployment/ci/` — empty; CI presently lives in `.github/workflows/ci.yml`.
  - `platform/events/src/api/` — empty; reserved for the events API surface.
  - `specifications/future/` — empty; reserved for deferred 11xx–19xx spec families.
- **Naming nit:** `specifications/000-founcation/` is misspelled ("founcation" →
  "foundation").
- Scaffolding dirs (`architecture/ extensions/ governance/ sdk/`) all carry READMEs
  (confirmed, 298–334 bytes each).

**STATUS: Pass.** The tree is genuinely clean of build artifacts and temp files. The
four empty dirs are documented placeholders, not litter — but they trip "empty dir"
linters and create one structural ambiguity (two ADR homes).

**RECOMMENDATION.** Either (a) populate placeholders with `.gitkeep` + a README
explaining intent, or (b) remove the truly redundant ones and add them back when used.
Specifically: resolve the **two ADR homes** — pick `documentation/adr/` as canonical
and either delete `architecture/adr/` or make `architecture/` derived-diagrams-only.
Fix the `000-founcation` typo. All cosmetic; none release-blocking. (Deletion/rename
deferred here because the FUSE mount disallows `unlink` — see §10.)

---

## 10. Remaining repository technical debt

**FINDINGS (all previously tracked, none newly introduced).**
- **CRIT-1 — async EventLog kernel:** target contract + Postgres adapter defined
  (KEP-001, `review/07`); reverted in-sandbox to protect the green baseline because
  full consumer/test propagation needs a typechecked CI env. CI-gated.
- **HIGH-1 — offline `tsc`/`eslint` unverified:** registry/network blocked here
  (E-01); best-effort strip-types syntax check passed on all sources; authoritative
  verification is `npm run verify` in CI.
- **Persistence:** all stores are in-memory behind ports; only the Postgres EventLog
  adapter is code-complete + contract-tested via a fake SqlClient. Other adapters
  follow the same port pattern at deploy time.
- **Security:** enforcement **mechanism** (CallContext + Authorizer + requireActor)
  exists with tests; pervasive per-service identity threading, real OIDC/Vault/mTLS,
  encryption-at-rest, and signed/WORM events are deferred to production.
- **Minor:** determinism leaks (subscription/dead-letter timestamps), unbounded
  in-memory dedup, redundant service-local catalog shims — folded into the
  persistence/async cycle.

**STATUS: Defer (tracked, CI-gated).** These are GA prerequisites, correctly out of
scope for the RC and honestly documented in `KNOWN_ISSUES.md` and `review/10`.

**RECOMMENDATION.** Execute the "KMOS v1.0 Production Substrate" cycle (KEP-001 +
persistence + security) in a networked CI environment, then re-run the certification
and re-assess for GA. Architecture is sound and needs no redesign to carry this work.

---

## 11. Prioritized remediation list

### Already fixed this release (verified on disk)
- **Version normalized to `1.0.0-rc.1`** across all 29 manifests (§6 — `uniq -c`
  confirms a single version line).
- **Dead `vitest` stub removed from the test pipeline** — the repo-wide test runner is
  now `node:test`; no `vitest` dependency exists anywhere. _Residual:_ one stale
  `"test": "vitest run"` script remains in `packages/canonical-kernel/package.json`
  (harmless — tests run via the root glob — but see R1 below).
- **Scaffolding READMEs present** for `architecture/ extensions/ governance/ sdk/`
  (§1/§9), each documenting intent and the authoritative location today.
- **No build cruft / committed `dist/`** — earlier MED-3 (committed `dist/`) is
  resolved; `find` confirms zero artifacts (§9).

### To apply at the RC tag (low effort, non-blocking)
- **R1 — Configuration nit:** align `packages/canonical-kernel` `test` script to the
  standard `node:test` invocation used by the other 27 packages (§5).
- **R2 — Doc reconciliation:** update test counts to **217** in RELEASE-NOTES,
  IMPLEMENTATION_STATUS, and review/10 (§2/§8).
- **R3 — Doc consolidation:** add `engineering/review/README.md` index marking the
  authoritative certification and superseding older reports; cross-reference
  OPERATIONS↔DEPLOYMENT to remove deploy overlap (§2).
- **R4 — Cleanliness:** resolve the two ADR homes (canonicalize `documentation/adr/`),
  add `.gitkeep`+README to intentional empty dirs, fix the `specifications/000-founcation`
  typo (§9). _Deferred in-sandbox only because the FUSE mount disallows `unlink`/rename._

### Deferred to the Production Substrate cycle (with reasons)
- **D1 — CRIT-1 async EventLog kernel:** needs a typechecked CI env; reverting here
  protected the green baseline (§10).
- **D2 — HIGH-1 `tsc`/`eslint` verification:** registry/network blocked in-sandbox;
  authoritative run is CI `npm run verify` (§10, E-01).
- **D3 — Real persistence (Postgres adapters), authn/authz (OIDC/Vault/mTLS),
  encryption/WORM:** production deployment concerns, behind existing ports (§10).
- **D4 — Licensing:** business/legal owner decision; engineering supplies options
  only (§7).
- **D5 — Minor determinism/dedup/catalog-shim cleanups:** fold into the same cycle
  (§10).

_End of audit._
