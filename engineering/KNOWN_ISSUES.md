# KMOS — Known Issues, Risks, Gaps & Technical Debt

_Living document. Updated as issues are found and resolved._
_Last updated: 2026-06-30_

## Open risks (see Readiness Report §4 for mitigations)

| ID | Risk | Sev | Status |
|---|---|---|---|
| R-01 | Business logic leaks into Workflow/Applications/Events | High | Mitigation planned (fitness checks) |
| R-02 | Canonical object/event drift across services | High | Mitigation planned (canonical kernel) |
| R-03 | Event schema breaking changes break consumers | High | Mitigation planned (schema registry + compat modes) |
| R-04 | Replay not actually deterministic | High | Mitigation planned (IO-in-adapters + replay tests) |
| R-05 | Bootstrap cycle mishandled | Med | Resolved by D-002 micro-order |
| R-06 | Scope explosion into deferred features | Med | Hard-gated by roadmap |
| R-07 | Storage coupling past ports | Med | Mitigation planned (ports + lint) |
| R-08 | Governance/lineage retrofitted late | High | Built in M1, in every DoD |
| R-09 | Long-running agent context loss | Med | Mitigated by these tracking docs |
| R-10 | Idempotency/at-least-once violated | Med | Mitigation planned (dedup tables) |
| R-11 | Multi-language sprawl in capability workers | Low | Contained by capability contract boundary |
| R-12 | Spec gaps resolved with silent assumptions | Med | Mitigated by DECISIONS.md discipline |

## Specification gaps (see Readiness Report §5)

| ID | Gap | Critical path? | Handling |
|---|---|---|---|
| G-01 | KMOS-0208 Search & Discovery Service not written | No | Draft conformant spec before building (M2) |
| G-02 | Configuration Service has no dedicated spec | No | Derive from KMOS-0160/0190/0200; draft spec (M2) |
| G-03 | Capability Runtime specified only implicitly | No | Define from KMOS-0160 runtime contract (M2) |
| G-04 | No field-level JSON Schemas in catalogs | No | Author canonical kernel schemas (M0) |
| G-05 | Reality-Check evidence repos not in workspace | No | Implement from specs; ask user to add repos if desired |
| G-06 | Tenancy isolation strategy unspecified | No | Default shared-schema + org-id scoping (D-D); confirm at M1 |
| G-07 | Future family specs (11xx–19xx) not written | No | Deferred until core proves architecture |

## Technical debt
- TD-01: M0 ships an in-memory `EventLog` and in-process bus (modular-monolith-first, per D-C). The Postgres `EventLog` adapter + migrations land in WP-1 (Event Service). The kernel already exposes the `EventLog` port so this is a drop-in.
- TD-02: The kernel uses a small zero-dependency schema validator (D-F). Sufficient for the canonical envelope/object structure; per-object-body schemas grow with each service.

## Environment constraints (sandbox)
- E-01: The npm registry is blocked (HTTP 403) in this sandbox. Tests + fitness run offline via Node's built-in runner (D-E); `eslint`/`tsc` (lint/typecheck) require network and run in CI.
- E-02: The workspace is a FUSE mount that does not support `git` (the `.git` store does not persist correctly) and disallows file deletion (`unlink`). Working increments are therefore captured as files, not commits. On a normal checkout, `git init` + commits work; CI assumes a standard git repo. Files written via the editor are occasionally truncated on this mount; large/critical files are verified after writing (e.g. byte count + JSON parse).

## Deferred / out of scope until core is proven (per constitution)
Distributed deployment strategies · federated institutional knowledge · marketplace governance · advanced semantic inference · cross-organization trust · long-term archival optimization · predictive orchestration.

## Action items for the human
- AI-01: Approve/amend Section 11 decisions (D-A/D-B/D-C) and authorize M0.
- AI-02 (optional): Add prior reference repos ("Media Pipeline" / "AIMPOS") to the workspace as engineering evidence, if available.

## M1 follow-ups (minor, non-blocking)
- M1-01: Identity Service emits `IdentityCreated` for organization creation (kernel catalog has no `OrganizationCreated`). Consider adding `OrganizationCreated` to the catalog in M2 for cleaner semantics.
- M1-02: Asset Registry registers two extra event types (`AssetRestored`, `StorageMigrated`) on a local catalog; Governance registers eight (`PolicyRegistered`, etc.). These should be promoted into the kernel Canonical Event Catalog (KMOS-10040) during M2 consolidation so a single shared catalog covers all engines without per-service extension.
- M1-03: In-memory repositories/adapters back all five engines (modular-monolith-first, D-C). Postgres adapters + migrations are scheduled for M5 hardening (TD-01 pattern), behind the existing ports.
- M1-04: Asset provenance `sourceAssetIds` at registration and `recordDerivation` are both supported and produce consistent lineage; prefer `recordDerivation` as the explicit lineage API.

## Architecture-freeze remediation cycle (2026-06-30)
- RESOLVED MED-3: committed dist/ removed.
- RESOLVED HIGH-3: fitness dependency-direction now enforced across ALL @kmos layers (26 packages mapped) + side-effect imports caught.
- RESOLVED MED-5: canonical event catalog consolidated into the kernel (97 types, single source of truth); service catalog factories are idempotent shims.
- PARTIAL CRIT-2/HIGH-2: enforced attribution + authorization + tenancy MECHANISM added at the event-bus chokepoint (CallContext + Authorizer + requireActor); 5 security tests. Pervasive per-service CallContext wiring + repository tenant scoping deferred to the CI-guarded cycle.
- RESOLVED CRIT-1 (KEP-001, ADR-0009, PR #1, 2026-06-30): the kernel `EventLog` port + `replay()` are now asynchronous; `InMemoryEventLog` and `PostgresEventLog` implement the SAME async port (the separate `AsyncEventLog` is a deprecated alias). The EventLog contract runs against a REAL Postgres in the CI database job. Await-everywhere (KEP-D1) enforced by fitness rule (5). Adversarial review caught + fixed 6 production await gaps a stale incremental build had hidden.
- RESOLVED HIGH-1 (2026-06-30): a real CI now runs `npm run verify` (eslint + `tsc --build` + fitness + full tests) plus a real-Postgres database job on every PR and on `main`; `tsc` is the guard that made the async migration safe.

## Olares deployment (2026-07-01 — ADR-0010, review/18)
- VALIDATED on real Olares (`mwayolares`): install via the Olares Application Chart accepted; Olares provisioned PostgreSQL; full workflow ran end-to-end; durable event log survived an app restart (77→79 events). Image public on Docker Hub (release-image.yml).
- RESOLVED (ADR-0011, 2026-07-01) — **read-model recovery on boot**: every service now rebuilds its repositories from the durable log on boot via state-carried events + `hydrate()`. After a restart, object detail (`GET /knowledge/:id`), version history, lineage, governance, and authorization behave identically. Per-service rebuild tests + compose restart-cycle validation. Honest limits in ADR-0011 (roles created-but-never-assigned, timers, intermediate non-terminal approval states are not separately snapshotted).
- OPEN (v1.x, non-blocking): Olares-identity → KMOS `CallContext` attribution bridge; distributed tracing backend; rehearsed pg_dump backup/restore drill on Olares Postgres; multi-replica HA (blocked on read-model recovery).
- Suite after cycle: 201 tests pass, 0 fitness violations. See engineering/review/06-REMEDIATION-CERTIFICATION-REPORT.md.
- ENVIRONMENT: editor write/edit truncates large files on this mount; use shell here-docs for big files (one truncation of asset-registry-service.ts occurred and was fully reconstructed).
