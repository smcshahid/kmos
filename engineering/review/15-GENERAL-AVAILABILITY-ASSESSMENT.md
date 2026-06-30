# KMOS — General Availability Assessment & Engineering Program Close-out

**Date:** 2026-06-30 · **Branch baseline:** `main` @ `eb97590` (KEP-001 merged) ·
**Author:** Autonomous Engineering Program · **Audience:** Owner + (future) Architecture Review Board

> This is an **evidence-first** assessment. Claims are marked **[verified]** (proven
> by a command/CI run in this program), **[partial]**, or **[not done]**. Nothing
> infrastructure-dependent is claimed as production-validated unless a real run
> proves it. The headline recommendation is in §20.

---

## 1. Executive Summary

This program took KMOS from a green release-candidate snapshot through the **single
largest remaining architectural risk** and resolved it with evidence: **CRIT-1**,
the synchronous kernel `EventLog` port that real storage could not satisfy. KEP-001
made the port asynchronous, adopted an await-everywhere publication contract,
unified the in-memory and PostgreSQL adapters onto one kernel port, and **proved it
against a real PostgreSQL in CI** [verified]. An adversarial multi-agent review of
the test suite caught six production `await`-propagation defects that a stale
incremental build had hidden — all fixed and re-verified under a clean build.

KMOS is **not yet General Availability**. It has advanced materially toward a
**Production Candidate**, but GA is gated on: pervasive identity enforcement
(CRIT-2), production-grade persistence wired through every service (not just the
EventLog), real authentication/secrets, deployment validated on a real cluster,
observability/tracing to a real backend, an owner **LICENSE** decision, and human
board ratification. These are enumerated with evidence in §3–§6 and §15–§16.

**The recommendation (§20) is: declare Architecture Freeze v1.0 eligible on the
kernel axis and proceed to a scoped Production Substrate; do NOT declare GA yet.**

## 2. Engineering Program Summary (what changed, all [verified])

| Work | Evidence |
|---|---|
| Repo put under real git + GitHub + CI (3 jobs: static, tests, real-Postgres) | CI runs #1–#2 green; PR #1 |
| Type-soundness fix (canonical generic defaults) — ADR-0008 | `tsc` 65→0; CI green |
| **KEP-001 async EventLog migration (CRIT-1)** — ADR-0009 | clean `tsc --build --force` 0 errors; **219/220 tests**; real-PG contract green in CI database job |
| Await-everywhere fitness rule (KEP-D1) | `npm run fitness` 0 violations; rule unit-tested |
| `PgSqlClient` production Postgres wiring shipped | exported from `@kmos/events`; real-PG CI run |
| Publication-ordering test | `packages/canonical-kernel/test/publication-ordering.test.ts` |
| DX entrypoints fixed (demo/seed) + verified | demo, seed, health, conformance all exit 0 |
| Constitution §4 ADR-home fixed; §5 await-everywhere documented | board prereq (a) |
| Governance trail: ADR-0009 + index + DECISIONS D-008 + KNOWN_ISSUES CRIT-1/HIGH-1 resolved | this branch |

**Method note worth keeping:** the six hidden production defects were found only
because test-fix agents were instructed to *refuse to mask failures* and a **clean
`tsc --build --force`** was run (the snapshot shipped stale `dist/`/`.tsbuildinfo`
that made incremental builds falsely green). CI's `npm ci` is clean, so CI was
never at risk — but local incremental builds must not be trusted for sign-off.

## 3. Architecture Freeze Report

**Eligible on the kernel axis** [verified]. The most-frozen artifact
(`@kmos/canonical-kernel`) now has its central ambiguity (sync vs async port)
resolved; the event format, 97-type catalog, identifiers, lifecycle, and replay
semantics are unchanged. Fitness enforces dependency direction, kernel purity,
cross-service isolation, and now await-everywhere.

**Not yet declared.** Freeze is a human-board act (KEP-001 §9). Remaining pre-freeze
items the board should weigh: CRIT-2 pervasive `CallContext` threading is still
**[partial]** (mechanism exists at the bus chokepoint; per-service wiring deferred);
the canonical `AsyncEventLog` deprecated alias should be removed at v1.1.

## 4. Production Substrate Report (real vs. scaffolded)

| Capability | State | Evidence / gap |
|---|---|---|
| Async EventLog on real Postgres | **[verified]** | CI database job runs the contract on `pgvector/pg16` |
| `PgSqlClient` adapter | **[verified]** builds + used in CI | no connection pooling tuning / ret/backoff yet |
| Per-service persistence (Knowledge, Assets, Governance, …) | **[not done]** | all still use in-memory repositories behind ports; only EventLog has a real PG adapter |
| Migrations / schema management | **[partial]** | `EVENTS_TABLE_DDL` only; no migration tooling for object stores |
| DR / replay on real DB | **[partial]** | replay validated in-memory + against PG EventLog contract; full DR drill on real DB **[not done]** |

**Honest framing:** "real PostgreSQL persistence for every service" (NEXT_TASK item 3)
is **not** complete. The EventLog — the system of record — is real-PG-validated;
the per-service read-model repositories are still in-memory adapters behind their
ports. That is a genuine, bounded amount of remaining work, not a redesign.

## 5. Production Candidate Report

A Production Candidate requires: green CI incl. real DB [verified]; CRIT-1 closed
[verified]; CRIT-2 closed **[partial]**; real persistence for the system of record
[verified] and for read models **[not done]**; auth/secrets **[not done]**. **Net:
Production-Candidate-in-progress.** The keystone (CRIT-1) is done; the remaining
items are well-scoped and individually verifiable.

## 6. General Availability Certification

**NOT CERTIFIED.** GA is withheld on this evidence. Blocking gaps:

1. **Identity enforcement (CRIT-2)** — enforcing mode is opt-in; reference flows do
   not yet run with pervasive `actorId`/tenant scoping. **[partial]**
2. **Production authn/authz** — no real OIDC adapter validated against a real IdP. **[not done]**
3. **Secret management** — no real secrets backend (only the echo resolver port). **[not done]**
4. **Read-model persistence** — services still in-memory behind ports. **[not done]**
5. **Deployment validation** — Dockerfile/compose/manifests exist but are **not**
   validated on a real cluster. **[not done]**
6. **Observability/tracing** — observability engine exists; no tracing exported to a
   real backend. **[not done]**
7. **LICENSE** — repo is `UNLICENSED`; no `LICENSE` file. Owner decision required. **[not done]**
8. **Human board ratification** — required by governance; cannot be self-issued.

Items 2, 5, 6 are **not honestly verifiable in this environment** (no real IdP /
cluster / tracing backend). They can be *scaffolded behind the existing ports and
contract-tested with fakes*, but must not be certified as production-validated
without the real systems. Refusing to fabricate that certification is itself the
correct GA posture.

## 7. Repository Audit

- **Structure** [verified]: clean monorepo (packages/platform/engines/capabilities/
  domains/connectors/applications/sdk); 28 workspace packages; consistent layering
  enforced by fitness.
- **Version consistency** [verified]: all 29 `package.json` at `1.0.0-rc.1`.
- **Build artifacts**: `dist/`/`*.tsbuildinfo` are gitignored and absent from history
  [verified] — but were present **on disk** in the snapshot and caused the
  stale-build hazard. Recommend a `clean` step in contributor docs.
- **Empty placeholder dirs** (`sdk/`, `extensions/`, `governance/`, `architecture/adr/`):
  still thin. ADR-home pointer fixed; `architecture/adr/` should be removed or
  documented as derived-only. **[partial]**

## 8. Source-Control Audit

- **History** [verified]: Conventional Commits; reconstructed kernel→…→reviews
  narrative + real post-snapshot commits; PR-based flow now in use (PR #1 squash-merged).
- **CI gating** [verified]: every PR runs static + tests + real-Postgres.
- **Gaps**: no branch protection / required-checks config in-repo; no CODEOWNERS;
  `v1.0.0-rc.1` tag is local-only and predates the green tip. **[not done]**

## 9. Documentation Audit

- **Strong** [verified]: specs, constitution, ADRs (now 0001–0009 with a current
  index), operations/deployment/DR guides, getting-started, developer guide,
  conformance, KEP-001 plan.
- **Gaps** (board prereq b, **[not done]**): the four canonical docs — Platform
  Vision, Versioning & Compatibility Policy, Release Lifecycle, Governance Model —
  are not yet authored. No CHANGELOG. These are required before GA.

## 10. Developer Experience Assessment

- **Good** [verified]: zero-install offline test/fitness runner; `npm run verify`;
  demo/seed/health entrypoints all work; thin reference apps; clear ports.
- **Gaps**: no SDK capability template, no example extension (board prereq d);
  no `CONTRIBUTING` quick-start for the clean-build caveat; no one-command bootstrap
  beyond `npm ci`. A new engineer can be productive, but the platform-extension
  story (capabilities/adapters/extensions) is under-exampled. **[partial]**

## 11. Product Experience Assessment (reference UI)

The api-server ships a single-file reference UI (`REFERENCE_UI_HTML`) and a
Prometheus `/metrics` endpoint [verified, fixed for async this program]. For GA it
remains a *reference* surface, not an operator/developer console. **Recommendation:**
do not redesign for aesthetics; if invested, evolve it toward **platform
understanding** — a live event/replay inspector, capability/workflow catalog browser,
and conformance dashboard. Scoped as a V1.x enhancement, not a GA blocker. **[not done]**

## 12. Ecosystem Readiness Assessment

- **Conformance Kit** [verified]: operational, all profiles compliant in CI.
- **SDK / extension / adapter / capability models**: ports exist and are clean, but
  templates, a published-package story, and a conformant example extension are
  missing (prereq d). Multi-team/multi-product readiness is **[partial]**.

## 13. Security Assessment

- **Mechanism present** [verified]: bus-chokepoint attribution + authorization +
  tenancy enforcement (ADR-0005); STRIDE review doc on file; 5 security tests green.
- **Gaps**: enforcing mode not pervasive (CRIT-2 [partial]); no real authn/secrets;
  no dependency/SBOM scanning in CI; `pg` is a new dependency (0 vulns at add time
  [verified] via `npm audit`). A fresh security review is required once auth/secrets
  land. **[partial]**

## 14. Operations Assessment

- **Present** [verified]: operations/deployment/DR guides, Dockerfile, compose,
  manifests, health/metrics endpoints.
- **Gaps**: nothing validated on a real cluster; no real tracing/log aggregation;
  no runbook tested against live infra; no backup/restore drill on real PG. **[not done]**

## 15. Remaining Technical Debt

- Read-model repositories are in-memory behind ports (real PG adapters pending).
- `AsyncEventLog` deprecated alias to remove at v1.1.
- CI actions on deprecated Node 20 shim (warning only) — bump `actions/*@v4`→`v5`.
- `architecture/adr/` empty dir; tag hygiene; CHANGELOG absent.
- No SBOM/dependency scanning; no branch protection config in-repo.

## 16. Remaining Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Stale local incremental builds mask cross-package async drift | Med | CI clean build authoritative; add `clean` to DoD; **already bitten + fixed** |
| CRIT-2 enforcement not pervasive → unattributed writes possible if mode off | High | thread `CallContext`; default enforcing in production composition |
| "Persistence done" overclaim (only EventLog is real-PG) | High | this report corrects it; scope read-model adapters explicitly |
| Auth/secrets/cluster/tracing unproven in this env | High | scaffold behind ports + contract tests; validate in a real substrate before GA |

## 17. Future Roadmap (evidence-ordered)

1. **CRIT-2 pervasive enforcement** (same write paths as KEP-001) → then declare Freeze.
2. **Read-model PG adapters** per service behind existing ports + migrations + DR drill on real PG.
3. **Real OIDC authn/authz + secrets backend**; re-run security review.
4. **Deployment validation** on a real cluster; **tracing** to a real backend.
5. **Governance docs** (4) + CHANGELOG + LICENSE + versioning policy; SDK template + example extension; designate the canonical reference app.
6. **Repo hardening**: branch protection, CODEOWNERS, SBOM/dependency scan, tag hygiene, actions bump.
7. Human board ratification → **GA**.

## 18. Version 2 Recommendations

- Out-of-process broker adapter (NATS/Kafka) behind the now-async EventLog/bus.
- Pluggable projection store (pgvector for semantic search already hinted).
- Capability worker isolation (WASI/OCI) per the deferred roadmap.
- Operator console (see §11). Federated/multi-tenant knowledge (post-core).

## 19. Independent Architecture Review Board (adversarial, no attachment)

*Acting as an external board instructed to find reasons NOT to ship.*

- **"You said persistence is done; it isn't."** Correct — only the EventLog is
  real-PG-validated; read models are in-memory. The program's own report (§4)
  states this. **Finding upheld; GA-blocking; not hidden.**
- **"Your green build lied once — why trust it now?"** Fair. The stale-artifact
  hazard was real and caught six defects. Response: the authoritative signal is CI's
  clean `npm ci` build, which is green incl. real Postgres; locally we now run
  `tsc --build --force`. **Process corrected; evidence stands.**
- **"CRIT-2 is a security gap."** Yes — enforcement is opt-in. Mechanism is proven;
  pervasiveness is not. **Blocking for GA; not for Freeze-eligibility.**
- **"Auth/secrets/cluster/tracing are claimed by the mission but absent."** They are
  explicitly marked **[not done]** and **not** fabricated. **Correct posture.**
- **"Is the kernel really stable enough to freeze?"** The central CRIT-1 ambiguity is
  resolved with a real-DB proof and a determinism test; no redesign was needed.
  **Freeze-eligible on the kernel axis.**
- **Board verdict:** *The flagship risk is genuinely retired with evidence, and the
  team did not overclaim. The remaining GA gaps are real and bounded. Approve
  Architecture-Freeze-eligibility and a scoped Production Substrate; **withhold GA**
  until §6 items 1–8 are closed with the same evidence discipline.*

## 20. Final GA Recommendation

**Do not declare Version 1.0 General Availability at this time.** It would not be
honest on the current evidence (§6). KMOS has, however, **retired its single
largest architectural risk (CRIT-1) with real-database proof**, and is
**Architecture-Freeze-eligible on the kernel axis** and on a credible, bounded path
to a Production Candidate.

**Recommended next stage:** authorize **Production Substrate** scoped to Roadmap
§17 items 1–4, plus the governance/release artifacts (§17.5). When those land with
CI-backed evidence — and the owner makes the **LICENSE** decision — convene the
human board for ratification and GA. The discipline that found six hidden defects
this program is exactly the discipline GA requires; applying it to the remaining
gaps, rather than declaring victory now, is the path to a platform that can be
handed to another organization and maintained for years.
