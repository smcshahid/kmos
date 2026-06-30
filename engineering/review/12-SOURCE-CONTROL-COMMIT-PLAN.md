# 12 — KMOS Source-Control Governance & Commit Plan

_Author: Principal Engineer (source-control governance)._
_Date: 2026-06-30 · Baseline: v1.0.0-rc.1._
_Companion to `11-REPOSITORY-AUDIT.md`._

---

## 0. Why this is a plan, not a set of commits

**Git cannot run in this environment.** The repository lives on a FUSE mount that
does not host a working git store:

```
$ git status
fatal: not a git repository (or any parent up to mount point
/sessions/.../mnt) — Stopping at filesystem boundary
```

This matches the documented constraint `engineering/KNOWN_ISSUES.md` **E-02**: the
mount's `.git` does not persist correctly and the filesystem disallows `unlink`, so
commits (which rewrite and delete objects) cannot be created here. Working increments
have therefore been captured as **files**, not commits, throughout the build.

Consequently, **this document is the authoritative commit sequence** to apply once
the tree is checked out into a normal git repository (a developer machine or CI).
Running `git init` and replaying the sequence below reconstructs a meaningful,
professional history that a future team can read and trust. Nothing here mutates the
working tree; it is governance, not execution.

### How to apply (on a normal checkout)
1. Copy the working tree into a fresh directory on a normal filesystem.
2. `git init && git branch -M main`.
3. Ensure `.gitignore` is in place **first** so `node_modules/`, `dist/`, and
   `*.tsbuildinfo` never enter history (the repo already ships a correct `.gitignore`).
4. Stage and commit per the sequence in §2, in order, using the exact
   `type(scope): subject` lines.
5. Apply the tags in §3.
6. Push; CI (`.github/workflows/ci.yml`) runs `npm ci → lint → fitness → typecheck →
   tests (+ DB job)`. Do not tag a release until that pipeline is green.

---

## 1. Commit conventions (governance rules)

- **Conventional Commits.** Every commit is `type(scope): subject`.
  - Types used: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.
  - Scope = the affected package/area (`kernel`, `events`, `identity`, `media`,
    `api-server`, `repo`, `docs`, …).
  - Subject: imperative mood, lower-case, no trailing period, ≤ ~72 chars.
- **No WIP commits.** No `wip`, `tmp`, `fixup`, `stuff`, or "address review" commits.
  Each commit is a coherent, reviewable unit that builds and (where applicable) keeps
  the offline gate green (`npm run verify:offline`).
- **Logical boundaries.** Group by workstream/milestone (below). Do not mix a feature
  with unrelated formatting. Tests land **with** the code they cover, not in a separate
  "add tests" dump, except where a milestone's certification suite is itself the
  deliverable.
- **Professional messages.** The body (1–2 lines) states intent and the spec/decision
  it derives from (e.g. "derives from KMOS-0110; ADR-0002"), not a diff restatement.
- **History is for humans.** A future engineer should be able to `git log --oneline`
  and read the project's story: kernel → engines → capability platform → domains →
  apps → hardening → certification → RC → remediation cycles.
- **Never commit generated artifacts or secrets.** `.gitignore` is committed first;
  `dist/`, `node_modules/`, `*.tsbuildinfo`, `.env*`, `coverage/`,
  `engineering/_extracted/` stay out of history.

---

## 2. Commit sequence

Grouped by milestone/workstream, in dependency and chronological order. Each entry is
one commit unless noted. Bodies are the intended 1–2 line descriptions.

### Bootstrap

1. `chore(repo): scaffold monorepo workspaces, tsconfig and gitignore`
   Establish npm workspaces (packages/platform/engines/capabilities/domains/
   connectors/applications/sdk), strict `tsconfig.base.json` + solution `tsconfig.json`,
   and `.gitignore`. Node ≥ 22.

2. `build(repo): add eslint flat config and dev type-strip runner`
   Add `eslint.config.mjs` (clarity rules; architecture delegated to fitness) and
   `tools/dev/{register,resolver}.mjs` so tests run offline via `node:test` +
   `--experimental-strip-types`.

3. `chore(repo): import specifications, reference dossiers and constitution`
   Add the normative `specifications/`, `reference/`, and `constitution/` source-of-truth
   documents the implementation derives from.

### M0 — Engineering Foundation (canonical kernel + gates)

4. `feat(kernel): add canonical kernel — objects, event envelope, schema validator`
   Single source of truth for canonical objects and the event envelope; zero-dependency
   schema validator. Derives from KMOS-0100/0110/0130; ADR-0002.

5. `feat(kernel): add in-process event bus and deterministic replay`
   In-process bus + append-only in-memory EventLog behind a port; deterministic replay.
   ADR-0003 (ports & adapters), ADR-0004 (EventLog port).

6. `test(kernel): cover envelope schemas, bus dispatch and replay determinism`
   Establish the green baseline the rest of the build defends.

7. `feat(fitness): add architecture-fitness checks (dependency direction)`
   `tools/fitness-checks/run.mjs` enforces layer dependency direction and bans
   side-effect imports across `@kmos/*`. Gate wired into `verify`.

8. `ci(repo): add CI pipeline — lint, fitness, typecheck, tests`
   `.github/workflows/ci.yml` static + tests jobs; the networked gate for offline-deferred
   checks.

### M1 — Foundational Engines

9. `feat(events): add Event Service over the kernel bus and EventLog port`
   Ports-and-adapters Event Service; in-memory adapter now, Postgres later behind the
   same port. KMOS-0203.

10. `feat(identity): add Identity Service (organizations, actors, attribution)`
    Identity as the attribution source for the event bus. KMOS-0190.

11. `feat(assets): add Asset Registry with provenance and derivation lineage`
    Asset registration + `recordDerivation` lineage. KMOS-0202/0006.

12. `feat(knowledge): add Knowledge Service (knowledge objects, projections)`
    Knowledge graph/indexes as projections, never system of record. KMOS-0201/0130.

13. `feat(governance): add Governance Service (policies, approvals, lineage)`
    Policy registration and approval workflow; governance built in, not retrofitted.
    KMOS-0008.

14. `test(engines): add per-engine unit suites and event-attribution tests`
    Cover the five M1 engines and their canonical event emission.

### M2 — Capability Execution Platform

15. `feat(capability-registry): add capability registry and specifications`
    Register/resolve capabilities against the capability contract. KMOS-0120.

16. `feat(capability-runtime): add capability runtime and execution boundary`
    Execute capabilities behind the contract boundary. KMOS-0160; draft KMOS-0210.

17. `feat(workflow): add workflow/orchestration engine`
    Workflow definition + orchestration over capabilities. KMOS-0150/0007.

18. `feat(configuration): add configuration service`
    Configuration behind ports. Draft KMOS-0209 (derived from 0160/0190/0200).

19. `feat(search): add search & discovery service (projection-backed)`
    Search indexes as projections. Draft KMOS-0208.

20. `feat(platform-catalog): add platform catalog engine`
    Software-catalog view over governance/runtime/workflow/config/search.

21. `test(platform): add capability execution and workflow integration tests`
    Exercise registry→runtime→workflow→search end to end.

### M3 — Domain Services

22. `feat(capabilities): add reference capability library`
    Reference capabilities used by domains; conformance anchor.

23. `feat(domains): add media domain (import, processing)`
24. `feat(domains): add language domain (analysis over knowledge)`
25. `feat(domains): add publishing domain (governed publication)`
26. `feat(domains): add preservation domain (archival lineage)`
27. `feat(domains): add ai-collaboration domain (governed AI + human oversight)`
    Domains compose capabilities behind the runtime; each derives from its KMOS-000x spec.

28. `feat(connectors): add connector framework (external ingestion)`
    Ports for external sources feeding assets/identity. KMOS-0180.

29. `test(domains): add domain service suites and cross-domain integration`
    Cover all five domains + connectors over the live platform.

### M4 — Applications

30. `feat(apps): add knowledge-studio application`
31. `feat(apps): add research-portal application`
32. `feat(apps): add archive-explorer application`
33. `feat(apps): add administration application`
34. `feat(apps): add public-api application`
    Thin applications composing platform + domain services; no business logic leakage
    (enforced by fitness). KMOS-0180.

35. `test(apps): add application suites`
    Cover each application surface.

### M5 — Production Hardening

36. `feat(observability): add observability engine (metrics, logging, health)`
    Zero-dependency `MetricsRegistry`/`StructuredLogger`/`HealthRegistry`.

37. `feat(events): add Postgres EventLog adapter behind a SqlClient port`
    Storage-replaceable EventLog (no `pg` import); `EVENTS_TABLE_DDL`. ADR-0004.

38. `test(events): add reusable EventLog contract test (in-memory + fake SQL)`
    Same contract runs against both adapters — proves replaceability behind the port.

39. `test(resilience): add disaster-recovery and event-migration tests`
    Institutional memory rebuilt by replay; backward-compat accepted, breaking change
    rejected.

40. `test(performance): add throughput smoke (5000-event publish + replay)`
    Stable-bound publish/replay performance guard.

41. `docs(security): add STRIDE security review (KMOS-0190)`
42. `docs(ops): add operations, deployment and disaster-recovery guide`
    Honest implemented/partial/deferred posture.

### M6 — Reference Certification

43. `feat(apps): add learning-platform application`
    Final reference application completing the M4 set for certification.

44. `test(certification): add certification suite (10/10 success criteria)`
    Cross-cutting certification suite over the live platform.

45. `docs(engineering): add certification report and engineering readiness report`
    `KMOS-CERTIFICATION-REPORT.md` + readiness report.

### Release Candidate

46. `feat(api-server): add HTTP API server and reference UI surface`
    REST API + OpenAPI (`documentation/api/openapi.json`); composes all services.
    ADR-0006.

47. `feat(examples): add end-to-end knowledge-lifecycle demo`
    `npm run demo`: full lifecycle, 88-event audit rebuilt by replay, 0 dead letters.

48. `docs(release): add release notes, developer/getting-started/guides and ADRs`
    Complete `documentation/` suite + `documentation/adr/` (ADR-0001..0007).

49. `chore(release): set all workspaces to 1.0.0-rc.1`
    Lockstep version across root + 28 packages.

### Architecture-freeze remediation cycle (2026-06-30)

50. `fix(repo): remove committed dist/ build output from the tree` (MED-3)
    Build artifacts never belong in history; `.gitignore` already excludes them.

51. `feat(fitness): enforce dependency direction across all @kmos layers` (HIGH-3)
    Extend fitness to every package + catch side-effect imports.

52. `refactor(kernel): consolidate canonical event catalog as single source` (MED-5)
    97 event types in the kernel; service catalog factories become idempotent shims.

53. `feat(kernel): add CallContext, Authorizer and requireActor at the bus chokepoint` (CRIT-2)
    Enforced attribution + authorization + tenancy mechanism. ADR-0005.

54. `test(security): add attribution/authorization enforcement suite`
    Reject unattributed and denied/cross-tenant writes.

55. `docs(engineering): record remediation certification and kernel evolution plan`
    `review/06` + KEP-001 (`review/07`) for the deferred async-kernel work (CRIT-1).

### Platform hardening — server/UI closeout

56. `docs(engineering): add platform-hardening closeout and external consultancy review`
    `review/09` + `review/10`; honest GA gap ledger.

### Production-foundation — conformance & governance

57. `feat(conformance): add KMOS Conformance Kit (contract profiles)`
    `packages/conformance` defines the contracts an SDK/implementation must satisfy.
    ADR-0007.

58. `test(conformance): add conformance profiles to CI`
    `npm run conformance` wired into the tests job.

59. `docs(repo): add scaffolding READMEs for architecture, extensions, governance, sdk`
    Document intended contents and the authoritative location today.

### Repository audit (this cycle)

60. `docs(engineering): add repository audit and source-control commit plan`
    `review/11` + `review/12` (this document). No source changes.

### Optional follow-ups at the RC tag (from audit §11 — apply if the owner approves)

61. `fix(kernel): align test script to node:test runner` (audit R1)
    Replace the stale `vitest run` stub in `packages/canonical-kernel`.

62. `docs(repo): reconcile test counts to 217 and consolidate cert/ops docs` (R2/R3)

63. `chore(repo): canonicalize documentation/adr, gitkeep placeholders, fix spec typo` (R4)
    Resolve the two ADR homes; rename `specifications/000-founcation` →
    `000-foundation`. (Requires `unlink`/rename — only possible on a normal checkout.)

---

## 3. Branching & release tags

**Branching model.**
- `main` is always green (CI gate). Protected; no direct pushes.
- Feature/milestone work on short-lived `feature/<scope>` or `milestone/m<n>-<name>`
  branches, merged via PR after `npm run verify` passes in CI.
- Remediation cycles on `chore/<cycle-name>` (e.g. `chore/freeze-remediation`),
  same gate.

**Release tags** (annotated, signed where possible), consistent with
`documentation/RELEASE-NOTES.md` and `review/10`:
- `v1.0.0-rc.1` — this Release Candidate, tagged on `main` once CI (incl. the
  PostgreSQL `database` job to the extent applicable) is green. Library-grade reference
  release.
- `v1.0.0-rc.2`, … — subsequent RCs as remediation lands.
- **Architecture Freeze v1.0** — a `freeze/architecture-v1.0` tag (or annotated
  `freeze-v1.0`) declared only after **CRIT-1** (async kernel under `tsc`) lands green
  in CI, per `review/05` freeze recommendation and `review/10` §8.
- `v1.0.0` (GA) — tagged only after the Production Substrate cycle (async kernel +
  real persistence + real authn/authz + full CI incl. DB) and **human board
  ratification**. Do not auto-promote.

**Tagging discipline.** Tag only commits where the full CI pipeline is green. The RC
tag must sit at or after commit 49 (version bump); GA only after the deferred D1–D3
items in audit §11 are resolved and verified in a networked environment.

_End of plan._
