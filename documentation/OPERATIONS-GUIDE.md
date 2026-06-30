# KMOS Operations, Deployment & Disaster-Recovery Guide

_Operational guide for the KMOS reference implementation (M5 hardening)._
_Grounded in the actual repository: scripts in `package.json`, fitness checks in `tools/fitness-checks/`, the dev runner in `tools/dev/`, the CI workflow at `.github/workflows/ci.yml`, and `deployment/docker/docker-compose.dev.yml`._
_Last updated: 2026-06-30 · Audience: operators, release engineers, on-call._

---

## 1. What you are operating

KMOS is currently a **modular monolith**: a single deployable that composes all platform
services (events, identity, assets, knowledge, governance, capability-registry,
capability-runtime, workflow, configuration, search), the domain services
(media, language, publishing, preservation, ai-collaboration), the reference capabilities,
and the connector framework — all in-process, sharing one event bus, backed today by
in-memory adapters behind ports (DECISIONS D-C; Readiness Report §10.8).

This is a deliberate first deployment shape, not a limitation. KMOS-0200 §17 and the
Technical Reference Architecture (KMOS-0010 §4) state that *the logical architecture remains
identical across topologies — only the deployment topology changes*. Every service already
exposes versioned contracts, publishes/consumes canonical events, registers health, and
publishes metrics (KMOS-0010 §5), so each is independently extractable later without changing
the logical architecture.

> **Honesty note.** Where this guide describes Postgres, brokers, container orchestration or
> production secret stores, those are the **target** topology behind already-existing ports.
> The reference build runs in-process with in-memory stores; production adapters are M5/M6
> work. Items not yet built are marked **(deferred)**.

---

## 2. Deployment topology

### 2.1 Topology progression (KMOS-0200 §17)

| Stage | Shape | Storage | Eventing | Status |
|---|---|---|---|---|
| 0 | Single process, all services in-process | In-memory adapters | In-process dispatch (kernel `EventBus`) | **Current** |
| 1 | Modular monolith on one host + Postgres | PostgreSQL (event log + outbox + relational + JSONB + pgvector + AGE) | In-process dispatch; outbox relay | Partly scaffolded (compose for dev) |
| 2 | Containerised services, extractable | Postgres + object storage | Real broker via outbox/CDC | (deferred) |
| 3 | Kubernetes / Helm, services scale independently | Polyglot stores behind ports | Broker (Kafka/NATS) | (deferred) |

The same code moves across stages because storage, broker, IdP and AI models are ports
(DECISIONS D-006); swapping an in-memory adapter for a Postgres or broker adapter does not
touch any service core. KMOS-0010 §4 enumerates the supported end-state topologies (single
machine, small org, enterprise cluster, hybrid/private/public cloud, edge, offline archive,
distributed federation) — all the *same* logical architecture.

### 2.2 Logical layers (KMOS-0010 §3)

```
Layer 5  Applications              applications/*        (thin facades, replaceable)
Layer 4  Capability Workers        capabilities/*        (all business compute)
Layer 3  Domain Services           domains/*             (compose capabilities)
Layer 2  Platform Services         platform/*            (10 core services)
Layer 1  Infrastructure            *infrastructure/*     (adapters: storage/broker/IdP/model)
         Foundation                packages/canonical-kernel  (canonical types + event bus)
```

Dependency direction (`applications → domains → capabilities → engines/platform → packages`)
is enforced in CI by `tools/fitness-checks/run.mjs`; imports may only point down the stack,
and no platform service imports another's internals.

---

## 3. Build, test & verify

All commands are defined in the root `package.json` (npm workspaces, Node ≥ 22).

| Command | What it runs | When |
|---|---|---|
| `npm run build` | `tsc --build` — produces the shipped build | release / CI |
| `npm run lint` | `eslint .` | CI, pre-merge |
| `npm run typecheck` | `tsc --build` | CI, pre-merge |
| `npm run fitness` | `node tools/fitness-checks/run.mjs` — architecture invariants | CI, pre-merge, offline |
| `npm test` | `node --experimental-strip-types --import ./tools/dev/register.mjs --test ...` across all workspaces | CI, offline |
| `npm run verify` | `lint && typecheck && fitness && test` — **the CI gate** | CI / pre-merge |
| `npm run verify:offline` | `fitness && test` — the subset that needs **no network** | local / air-gapped |

### 3.1 `npm run verify` is the gate

CI (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request:
`checkout → setup-node@22 (npm cache) → npm ci → lint → fitness → typecheck → test`. A change
is mergeable only when the full `verify` chain is green. Per constitution §7, "done" means
production-ready (tests green, events validated, observability + governance present, deploy
verified), not merely compiling.

### 3.2 `npm run verify:offline` and why it exists

The sandbox npm registry is blocked (DECISIONS D-E). `lint` and `typecheck` need
`npm ci` (eslint/tsc come from the registry) and therefore run in CI where the registry is
reachable. `fitness` and `test` have **zero external dependencies**, so
`verify:offline` (`fitness && test`) runs fully air-gapped on a developer machine or in a
locked-down environment. This is the command to reach for when you cannot install packages.

### 3.3 The `--experimental-strip-types` dev runner — and why

`npm test` uses Node 22's built-in test runner with `--experimental-strip-types` plus a tiny
dev-only resolver hook (`tools/dev/register.mjs` → `tools/dev/resolver.mjs`) that maps the
spec-correct NodeNext `.js` import specifiers to the `.ts` sources during test. Rationale
(DECISIONS D-E):

- The registry is blocked, and the constitution favours minimal dependencies and
  institutional longevity — so the project uses **zero external test dependencies**
  (`node:test` + `node:assert`) instead of a third-party runner.
- Sources keep spec-correct `.js` import specifiers (NodeNext); the dev resolver lets Node
  run the `.ts` directly during test, while the **shipped build is still produced by `tsc`**.
- Net effect: `npm test` and `npm run fitness` run fully offline; CI additionally runs
  lint/typecheck once the registry is reachable.

### 3.4 Local dev with Postgres (docker-compose)

`deployment/docker/docker-compose.dev.yml` brings up the single polyglot backbone for the
monolith-with-Postgres stage:

- Image `pgvector/pgvector:pg16` (Postgres 16 + pgvector), container `kmos-postgres`,
  DB/user/password `kmos`, port `5432`, named volume `kmos-pgdata`, with a `pg_isready`
  healthcheck.
- One Postgres instance is intended to provide the event log + outbox, relational records,
  JSONB documents, pgvector embeddings, and graph via Apache AGE / recursive CTEs — all behind
  repository ports (DECISIONS D-B). Specialized stores (Neo4j, OpenSearch, object storage, a
  real broker) are slotted later behind the same ports.

```
docker compose -f deployment/docker/docker-compose.dev.yml up -d   # start Postgres
docker compose -f deployment/docker/docker-compose.dev.yml down     # stop (keeps volume)
```

> The Postgres **repository adapters** that bind the services to this database are M5 work
> (deferred); the compose file and persistence design (D-B) are in place ahead of them.

---

## 4. Configuration & secrets

- **Configuration Service** (`platform/configuration`, KMOS-0209) owns configuration as
  versioned canonical objects (`ConfigurationVersion`) and resolves them per service.
- **Secrets are referenced, never inlined.** Configuration persists only a `SecretReference`
  pointer; the clear value is fetched on demand through the `SecretResolver` port
  (`platform/configuration/src/domain/secret-resolver.ts`). A `ConfigurationVersion` never
  contains a clear secret.
- **Today's adapter** is `EchoSecretResolver` (in-memory, dev/test). **Production (deferred)**
  swaps in a HashiCorp Vault / cloud KMS adapter behind the same port — no caller changes.
- **Operational rule:** never put a clear secret in a config value, env file committed to the
  repo, or log line. Reference it; resolve it at runtime.

---

## 5. Observability

Every service exposes health, metrics, logs and events (KMOS-0010 §5, KMOS-0200 §13,
KMOS-9999 §18) using the shared, zero-dependency **`@kmos/observability`** engine
(`engines/observability`).

| Signal | Mechanism | Notes |
|---|---|---|
| Health | `HealthRegistry` (`health.ts`) | Named checks (storage reachable, broker connected, deps healthy); `overall()` aggregates to `Ready` / `Degraded` / `Unavailable`. Any `Unavailable` ⇒ whole service `Unavailable`; else any `Degraded` ⇒ `Degraded`; else `Ready`. |
| Metrics | `metrics.ts` | Counters/gauges; deterministic (clocks/sinks injected). Per KMOS-0010 §5, every service publishes metrics. |
| Logs | `logging.ts` | Structured logging; sinks injected so cores stay deterministic (constitution §6). |
| Events | canonical event bus | Operational + security events (auth success/fail, policy violations, config changes) per KMOS-0190 §20. |

Determinism is intentional: clocks and sinks are injected, so observability adds no hidden
non-determinism to deterministic cores (constitution §6). **(Deferred:** wiring health/metrics
to HTTP probe endpoints and a scrape/trace backend — OpenTelemetry tracing per KMOS-0010 §5 —
is a deployment-time adapter task.)

---

## 6. Event-driven recovery & disaster recovery

KMOS's recovery model is its defining operational property: **institutional memory is rebuilt
from the event log.** Per KMOS-0010 (Replay) and KMOS-0190 §22, recovery preserves Knowledge,
Assets, Events, Workflow State, Capability/Extension registries, Governance records and
Identity.

### 6.1 The principle: projections are derived, the log is the truth

- The append-only event log is the **system of record**. Read models — the Knowledge graph,
  search indexes, workflow execution state — are **projections** that are *never* the system
  of record (KMOS-0201 §12; DECISIONS A-03).
- Any projection can be **dropped and rebuilt by replaying the log** from global sequence 1
  via the replay engine (`EventService.replayEvents`), which emits `ReplayStarted` /
  `ReplayCompleted` and never mutates history. The M3 integration test demonstrates one
  end-to-end journey across all domains landing in a single replayable log with zero dead
  letters.
- Workflow recovery follows the same model: the Workflow Service persists *coordination
  events* and reconstructs execution state by replay (Readiness Report §7.2), not from
  computed-state snapshots.

### 6.2 DR procedure (target topology)

| Scenario | Recovery action | Notes |
|---|---|---|
| Projection corrupted (graph/index/read model) | Drop the projection; replay the event log into a fresh projection; atomic swap | Shadow-projection + checkpoint pattern (Readiness Report §7.1); zero history mutation |
| Service instance lost | Redeploy the service; it rebuilds its read state by replaying its streams | KMOS-0010 Service Redeployment; health probe returns `Ready` when caught up |
| Datastore restored from backup | Restore the event log + outbox; replay forward to rebuild all projections | The log is the only thing that must be durably backed up to recover everything else |
| Poison event blocks a consumer | Inspect the dead-letter queue; remediate; never auto-loop | DLQ is for human judgment (Readiness Report §7.1) |

**Recovery objective:** because every projection is rebuildable from the log, the binding
constraint is the durability of the **event log + outbox**. Protect those above all else.

> **(Deferred):** the durable Postgres event log + outbox, point-in-time backups, and a
> rehearsed restore runbook are M5 work. Today's in-memory log demonstrates the replay-based
> recovery model but is not itself durable across a process restart.

---

## 7. Backup & retention

| Asset class | Backup approach (target) | Status |
|---|---|---|
| Event log + outbox | Continuous archival + PITR; this is the master copy of institutional memory | (deferred — needs Postgres adapter) |
| Asset bytes / object storage | Replicated object storage; WORM/Object-Lock for retention & legal hold | Modelled (RetentionRecord/ReplicationRecord); enforcement (deferred) |
| Configuration & secrets | Config versions backed up with the DB; secrets remain in Vault/KMS, backed up per that system's policy | (deferred — Vault adapter) |
| Governance records | Carried in the event log + governance projections; rebuildable by replay | Implemented (in-memory); durable store (deferred) |

Retention is **policy-driven** (KMOS-0190 §19): retention windows and legal holds are governed
data, not hardcoded. Integrity of retained assets is verifiable at any time via the SHA-256
checksum / `IntegrityRecord` mechanism (see SECURITY-REVIEW §8).

---

## 8. Scaling model

KMOS-0010 §5 mandates that *services remain independently deployable*; the topology
progression (§2.1) extracts them when load demands it.

- **Extract by contract.** A service is pulled out of the monolith into its own deployable
  behind the *same* canonical events + business APIs, then scaled horizontally. No logical
  rearchitecture (KMOS-0200 §17).
- **Scale with workload.** The services that scale with workload are **search**, the
  **capability runtime**, and the **workflow** engine — search indexing/query, capability
  execution (independently scalable, ideally WASI-sandboxed workers), and long-running
  workflow coordination grow with traffic, while lower-traffic services (identity,
  governance, configuration) scale conservatively.
- **Stateless cores, stateful edges.** Service cores are deterministic and hold no shared
  mutable state (constitution §6/§8); state lives in the event log and projections, so
  horizontal scaling is safe with idempotent, at-least-once consumers (`event-bus/bus.ts`).
- **(Deferred):** the broker, the per-service container/Helm manifests, and autoscaling
  policies are M5/M6 deliverables.

---

## 9. Incident response

Aligned to KMOS-0190 §21 (Detection → Investigation → Containment → Recovery → Evidence
Collection → Notification → Post-Incident Review). Incident workflows preserve institutional
evidence.

1. **Detect.** Health turns `Degraded`/`Unavailable`; security events (auth failures, policy
   violations, config changes) and metrics fire. Dead-letter growth is an early signal.
2. **Investigate.** Use the event log: correlation/causation queries reconstruct exactly what
   happened and on whose authority (every event has `actorId` + lineage). The log is immutable,
   so the investigation surface cannot be tampered with.
3. **Contain.** Disable the affected identity/credential (Identity Service), pause the affected
   subscription (Event Service supports pause/resume), or revoke a delegation.
4. **Recover.** Redeploy the service and/or rebuild the affected projection by replay (§6).
5. **Collect evidence.** The append-only log + `GovernanceAudit` records *are* the evidence;
   export the relevant correlation chain.
6. **Notify & review.** Record the incident as governance evidence; run a post-incident review
   and capture lessons in `engineering/DECISIONS.md` (constitution §9).

> **(Deferred):** automated detection/alerting (SIEM, threat indicators per KMOS-0190 §20),
> and rate-limiting/threat-detection at an API gateway (KMOS-0190 §16) are M5 work.

---

## 10. Operational readiness checklist

Use before promoting a build toward production. ✅ = available now; ☐ = deferred (M5/M6).

**Build & verification**
- ✅ `npm run verify` green in CI (lint, typecheck, fitness, test)
- ✅ `npm run verify:offline` green on an air-gapped machine
- ✅ Architecture fitness checks pass (0 violations; dependency direction + no cross-service imports + kernel purity + ports-and-adapters)
- ✅ Full test suite green (unit + contract + replay + domain integration)

**Architecture conformance**
- ✅ All business work in capabilities executed by the runtime; coordinate-never-compute upheld
- ✅ Canonical types imported from the kernel only; no redefined objects/events
- ✅ Connectors register assets through the Asset Registry (no platform bypass)
- ✅ AI participates as governed capabilities under canonical `AiWorker` identities; output non-authoritative until review

**Data & recovery**
- ✅ Event log is append-only; projections are rebuildable by replay
- ☐ Durable Postgres event log + transactional outbox in place
- ☐ Backup + PITR for the event log; restore runbook rehearsed
- ☐ Asset WORM/Object-Lock + replication enforced

**Security (see SECURITY-REVIEW.md)**
- ✅ Canonical identity for all actors; immutable audit; explainable authz
- ☐ Real IdP (OIDC), Vault/KMS secrets, TLS/mTLS, encryption-at-rest
- ☐ API gateway: rate limiting, input validation, threat detection

**Observability & ops**
- ✅ Health/metrics/logging via `@kmos/observability` in every service
- ☐ Health/metrics exposed on probe endpoints; tracing backend wired
- ☐ Alerting / SIEM export of security & operational events
- ☐ Per-service container + Helm manifests; independent scale/deploy verified

---

## 11. References

- **Repository:** `package.json` (scripts), `.github/workflows/ci.yml` (CI gate),
  `tools/fitness-checks/run.mjs` (architecture fitness), `tools/dev/register.mjs` +
  `tools/dev/resolver.mjs` (dev runner), `deployment/docker/docker-compose.dev.yml` (local
  Postgres), `engines/observability` (`@kmos/observability`).
- **Specs:** KMOS-0010 Technical Reference Architecture (§3 layers, §4 deployment model, §5
  service architecture, Replay), KMOS-0200 §17 (monolith → extractable services), KMOS-0190
  §19/§20/§21/§22 (compliance, security observability, incident management, disaster recovery),
  KMOS-0201 §12 (graph as projection), KMOS-0203 (event replay), KMOS-0209 (Configuration
  Service).
- **Engineering corpus:** `engineering/KMOS-ENGINEERING-READINESS-REPORT.md` (§7.1 event/outbox,
  §7.2 workflow replay, §10.8 deployment), `engineering/DECISIONS.md` (D-B persistence, D-C
  deployment shape, D-E test runner, D-006 ports-and-adapters),
  `engineering/IMPLEMENTATION_STATUS.md` (milestones + M3 acceptance evidence),
  `constitution/CODING-CONSTITUTION.md` (§6 determinism/replay, §7 definition of done).
- **Companion:** `documentation/SECURITY-REVIEW.md` (threat model + remediation backlog).
