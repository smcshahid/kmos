# Changelog

All notable changes to the KMOS reference implementation are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The current line is a **release candidate** (`1.0.0-rc.1`); the SemVer-major
intent of the async-kernel change (KEP-001) is captured in that pre-1.0 line per
ADR-0009.

All dated entries below reflect what the git history records: every commit in the
reconstructed history carries the date **2026-06-30**, so no other calendar dates
are asserted. Architecture Decision Records are under
[`documentation/adr/`](documentation/adr/).

---

## [1.0.0] — 2026-07-01 (General Availability — single-node self-hosted / Olares)

**KMOS v1.0 GA** for the single-node self-hosted (Olares) profile, certified in
`engineering/review/19-GENERAL-AVAILABILITY-CERTIFICATION.md`. Licensed
**proprietary — all rights reserved** (see `LICENSE`).

### Added
- **Read-model recovery (ADR-0011):** every service rebuilds its repositories from
  the durable event log on boot (state-carried events + `hydrate()`), so object
  retrieval, version history, lineage, governance, and authorization are IDENTICAL
  across restarts — verified on the owner's real Olares (object detail stable across
  restart cycles; event count 60→62→64) and locally over multiple docker-compose
  restart cycles.
- Proprietary `LICENSE`; `release-image` workflow publishing the public image
  (`docker.io/malikshahid85/kmos:1.0.0`).

### Certified scope (and limits)
- **Single-node self-hosted only** (`replicas: 1`). Multi-replica HA, managed-cloud,
  and high-scale profiles are **not** certified (v1.x; each needs its own evidence).
- Known cosmetic: 2 inert index-lifecycle events accrue per restart (no query
  impact). Recommended before production data: one `pg_dump` backup/restore drill.

## [1.0.0-pc.1] — 2026-07-01 (Production Candidate; validated on Olares)

### Added / Validated
- **Deployed and validated on a real Olares instance** (ADR-0010,
  `engineering/review/18`): installed via the Olares Application Chart
  (`deployment/olares/`), Olares provisioned PostgreSQL, the full workflow ran
  end-to-end, and the **durable event log survived an app restart** (77→79
  events). Public image on Docker Hub via `release-image.yml`.
- **Server honours `KMOS_DATABASE_URL`** (`createPlatformFromEnv`): a
  PostgreSQL-backed durable event log with search rebuild on boot; in-memory
  otherwise.
- CRIT-2 pervasive attribution (ambient `CallContext`); `EnvSecretResolver`;
  `.dockerignore`; supply-chain audit gate; version → `1.0.0-pc.1`.

### Known limitation
- Read-model (object-detail) recovery on boot is not yet implemented, so a restart
  recovers the event log + search but not `GET /:id` detail → **`replicas: 1`**.
  This is the top remaining pre-GA item (`engineering/review/18` §5–§6).

## [Unreleased]

Work staged for GA (the v1.0.0 final cut) — see
[`engineering/IMPLEMENTATION_STATUS.md`](engineering/IMPLEMENTATION_STATUS.md)
for the authoritative gap ledger. None of the items below are shipped; they are
recorded as roadmap:

- **Real persistence wired live.** The Postgres `EventLog` adapter, its DDL, and
  a `PgSqlClient` exist and are validated by the EventLog contract against a real
  Postgres in CI; wiring the platform's read models (Knowledge graph, Search
  index, and the other projections) to per-service Postgres adapters is not yet
  done — those read models are still in-memory projections rebuilt by replay.
- **Real security infrastructure.** OIDC/JWT identity provider, mTLS/SPIFFE,
  a Vault/cloud-KMS secret backend behind the existing `SecretResolver` port, and
  encryption-at-rest are designed but not deployed.
- **Cluster deployment.** No Helm charts or Kubernetes manifests exist yet; the
  container image is a build/verify/demo image, not a long-running server image
  in a cluster.
- **Distributed tracing backend.** Health and metrics are exposed
  (`npm run health`, `GET /metrics`, `GET /events/metrics`); an OpenTelemetry
  tracing backend is not wired in this environment.

## [1.0.0-rc.1] — 2026-06-30

The first **Release Candidate** (library-grade). The full platform core is
implemented and green; a complete institutional-knowledge lifecycle runs
end-to-end. See [`documentation/RELEASE-NOTES.md`](documentation/RELEASE-NOTES.md).

### Added

- **HTTP API server + reference web UI** (`@kmos/api-server`, `node:http`, zero
  runtime dependencies; `npm run serve`). REST surface per KMOS-0180 with
  `KmosError`→HTTP status mapping and attribution headers
  (`x-kmos-actor`, `x-kmos-organization`). Operability endpoints: `GET /health`,
  `GET /metrics` (Prometheus text exposition), and `GET /events/metrics`.
  OpenAPI at `documentation/api/openapi.json`. (ADR-0006)
- **Environment-backed secret resolver** (`EnvSecretResolver`,
  `platform/configuration/src/infrastructure/env-secret-resolver.ts`): a real,
  production-usable `SecretResolver` adapter for the "secrets as environment
  variables" deployment shape (12-factor, Kubernetes Secrets mounted as env,
  Docker `--env-file`, systemd `EnvironmentFile`). Clear values are never
  persisted into a `ConfigurationVersion`; a Vault/KMS adapter implements the same
  port later with no caller change.
- **Enforcing platform composition** wiring the `CallContext` / `Authorizer`
  chokepoint through the platform assembly.
- **Real Postgres EventLog validation.** The reusable EventLog contract test runs
  against a real PostgreSQL (`pgvector/pgvector:pg16`) in the CI `database` job,
  in addition to the in-memory adapter — proving one async port satisfied by two
  adapters. A `PgSqlClient` ships a usable production Postgres wiring behind the
  `SqlClient` port. A publication-ordering test asserts `await publish` resolves
  only after both append and dispatch.
- **KMOS Conformance Kit** (`@kmos/conformance`, `npm run conformance`): contract
  profiles (eventlog, authorizer, capability-handler, canonical-object,
  canonical-event) certifying the reference adapters. (ADR-0007)
- **Ecosystem docs:** `CONTRIBUTING.md`, `SECURITY.md`, and the ADR corpus
  (`documentation/adr/`).

### Changed

- **KEP-001 — asynchronous EventLog kernel migration (resolves CRIT-1).** The
  kernel `EventLog` port (`append`/`read`/`readStream`/`size`/`currentVersion`)
  and `replay()` are now asynchronous; `EventBus.publish` awaits the append under
  an **await-everywhere publication contract** (fire-and-forget emission is banned
  and enforced by a fitness rule). `InMemoryEventLog` and `PostgresEventLog` now
  implement the **same** async kernel port; the separate `AsyncEventLog` interface
  is deleted (a deprecated `type AsyncEventLog = EventLog` alias is kept for one
  RC). The **persisted event format, the 97-type catalog, correlation/causation,
  idempotency, and dead-lettering are unchanged — no data migration, old logs
  replay unchanged.** Landed atomically under `tsc` + tests + a real-Postgres
  contract run. (ADR-0009; supersedes the plan status of ADR-0004; plan in
  `engineering/review/07-KERNEL-EVOLUTION-PLAN.md`)
- **Pervasive attribution via ambient `CallContext` (CRIT-2).** Actor/organization
  attribution threaded through the (now-async) write paths, co-executed with
  KEP-001 because they touch the same paths.

### Fixed

- **Type soundness — align canonical generic defaults with their bound (ADR-0008).**
  The first-ever `tsc --build` against the full tree surfaced 65 type errors
  across 14 files (plus lint). Root cause: the canonical generics
  (`CanonicalObject`, `CanonicalEvent`, `StoredEvent`) were bounded at
  `extends object` but defaulted to `Record<string, unknown>`, which
  interface-typed bodies do not satisfy. The **default** (not the bound) was
  changed to `object`; the `AssetType` union was completed with `'Media'` and
  `'Publication'`. Compile-time only — no runtime, event-format, or data change.
  Closes board-review risk R-A ("type soundness has never been verified"). The
  repository now compiles clean under `tsc` and type soundness is an enforced CI
  gate.

## [0.x] — Platform build-out — 2026-06-30

The pre-RC build history, reconstructed from git. All commits are dated
2026-06-30; the groupings below are thematic, not chronological releases.

### Added

- **Canonical kernel** — canonical objects, the event envelope + schema
  validator, the in-process event bus, and deterministic replay. Zero runtime
  dependencies. (ADR-0002)
- **Event bus enforced attribution + authorization** — `CallContext`,
  `Authorizer` (PDP), and `requireActor` at the canonical event chokepoint, with a
  dedicated security enforcement test suite. (ADR-0005)
- **The seven Foundational Institutional Engines + Configuration + Search** as
  in-process platform services: Events (over the kernel bus and `EventLog` port),
  Identity, Assets (provenance + derivation lineage), Knowledge (objects +
  projections), Governance (policies, approvals, lineage), Capability Registry,
  Capability Runtime, Workflow/orchestration, Configuration, and a
  projection-backed Search service.
- **Postgres EventLog adapter** behind a minimal `SqlClient` port
  (`EVENTS_TABLE_DDL`: one `events` table, global `sequence BIGSERIAL` for total
  replay order, `UNIQUE(stream_id, version)` for optimistic concurrency), with a
  reusable EventLog contract test (in-memory + fake SQL). (ADR-0001, ADR-0003)
- **Capabilities → Domains → Applications** composition: a reference capability
  library; 5 domain services (media, language, publishing, preservation,
  ai-collaboration); and 6 thin applications (knowledge-studio, research-portal,
  archive-explorer, administration, public-api, learning-platform).
- **Connector framework** for external ingestion (assets registered through the
  Asset Registry, never bypassing the platform).
- **Observability engine** (`@kmos/observability`): metrics, structured logging,
  and a `HealthRegistry` — deterministic, with clocks/sinks injected.
- **Resilience & DR tests:** disaster-recovery (knowledge graph fully
  reconstructable by replaying the immutable log) and event-schema migration
  (BACKWARD compatibility; old events still replay after schema evolution).
- **Architecture-fitness checks** (`tools/fitness-checks/run.mjs`): dependency
  direction, no cross-service internal imports, kernel purity, ports-and-adapters.
- **CI pipeline** (`.github/workflows/ci.yml`): `static` (lint, fitness,
  typecheck), `tests` (unit → contract → security → integration → perf →
  certification → demo smoke), and `database` (contract tests against real
  PostgreSQL).
- **Deployment assets:** root `Dockerfile` + `docker-compose.yml` (build/verify/
  demo + Postgres) and `deployment/docker/docker-compose.dev.yml` (local Postgres).
- **Certification, readiness, and remediation engineering corpus** under
  `engineering/` and `engineering/review/`.
- **Documentation suite** under `documentation/` (Architecture, Developer,
  Deployment, Security Review, Operations, Capability- and Workflow-Development,
  Troubleshooting, Migration, Getting-Started, Release Notes, ADRs).

[Unreleased]: https://github.com/smcshahid/kmos/compare/v1.0.0-rc.1...HEAD
[1.0.0-rc.1]: https://github.com/smcshahid/kmos/releases/tag/v1.0.0-rc.1
