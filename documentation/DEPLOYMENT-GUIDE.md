# KMOS Deployment Guide

_How to obtain, build, verify, and run the KMOS reference implementation — and the
honest production-deployment roadmap beyond it._

_Grounded in the repository: `package.json` scripts, the root `Dockerfile` and
`docker-compose.yml`, `deployment/docker/docker-compose.dev.yml`, the CI workflow
`.github/workflows/ci.yml`, and the gap ledger in
`engineering/IMPLEMENTATION_STATUS.md`. Companion: `documentation/OPERATIONS-GUIDE.md`
(run-time operations, observability, DR, scaling, incident response) — this guide
does not duplicate it._

_Last updated: 2026-06-30 · Audience: evaluators, release engineers, platform operators._

---

## 0. What you are deploying (read this first)

KMOS is at **v1.0 Release Candidate, library-grade**. Be precise about what that means:

- **In-process services.** All ten platform services, the domain services, the
  reference capabilities, and the connector framework run as a single Node process
  sharing one canonical event bus. This is **Stage 0** of the topology progression
  in `OPERATIONS-GUIDE.md` §2.1 — a deliberate modular-monolith-first shape
  (KMOS-0200 §17), not a limitation.
- **In-memory persistence behind ports.** Every store is an in-memory adapter
  behind a kernel port. A PostgreSQL `EventLog` adapter and its DDL exist and are
  contract-tested against a fake `SqlClient`; live Postgres verification runs in CI.
- **A runnable demo, not a server.** There is **no long-running HTTP server, no web
  UI, and no Helm/Kubernetes deployment yet.** The deliverable you run today is the
  end-to-end reference demo (`npm run demo`), plus the verification gates and helper
  scripts.
- **Gated work.** The async-kernel migration (KEP-001), pervasive identity
  attribution, real persistence/security, an HTTP server, and a reference UI are
  staged and planned, gated to a typechecked + networked + Postgres-capable CI/dev
  environment per `engineering/IMPLEMENTATION_STATUS.md` (the v1.0-RC gap ledger).

If you only want to evaluate KMOS, use the **offline evaluation path** (§2). If you
are planning production, read the **production deployment roadmap** (§6).

---

## 1. Prerequisites

| Requirement | Detail |
|---|---|
| **Node.js 22+** | `node -v` must be `>= v22` (`package.json` `engines.node: ">=22"`). The dev runner uses Node 22's built-in test runner and `--experimental-strip-types`. |
| npm | Ships with Node 22 (workspaces are used; no extra package manager needed). |
| Git | To obtain the repository. |
| Docker + Compose | **Optional** — only for the container path (§4) and local Postgres (§5). |

Nothing else is required for the offline evaluation path: **no database, no network,
no build step, no global tooling.** The dev runner executes the TypeScript sources
directly via `--experimental-strip-types` plus a `.js`→`.ts` resolver hook
(`tools/dev/register.mjs` → `tools/dev/resolver.mjs`); the shipped build is still
produced by `tsc` (`OPERATIONS-GUIDE.md` §3.3).

---

## 2. Obtain and run (offline evaluation path)

```bash
git clone <kmos-repo-url> kmos
cd kmos

npm run verify:offline   # architecture-fitness + full test suite (no network)
npm run demo             # end-to-end knowledge lifecycle on the live platform
npm run health           # platform health dashboard (all services + bus)
npm run seed             # create a sample organization with starter knowledge
```

These four commands need no `npm install`, no database, and no network. They are the
canonical way to evaluate KMOS.

### 2.1 `npm run verify:offline`

Runs `fitness && test` — the subset of the verification gate that has **zero external
dependencies**:

- `npm run fitness` → `node tools/fitness-checks/run.mjs`: architecture invariants
  (dependency direction, no cross-service internal imports, kernel purity,
  ports-and-adapters). Expected: `KMOS architecture-fitness: OK (… 0 violations).`
- `npm test` → Node's built-in test runner across all workspaces. Expected: a
  passing summary (`# pass …  # fail 0`).

Why a separate offline target exists: `lint` and `typecheck` need `npm ci`
(eslint/tsc come from the registry), so they run in CI where the registry is
reachable; `fitness` and `test` run fully air-gapped (`OPERATIONS-GUIDE.md` §3.2,
DECISIONS D-E).

### 2.2 `npm run demo`

```bash
npm run demo
# node --experimental-strip-types --import ./tools/dev/register.mjs examples/knowledge-lifecycle-demo.mts
```

Runs the whole institutional journey on one shared canonical event bus using the real
services, domains, and application facades: organization + actor → media import +
transcription → language/knowledge extraction + multilingual vocabulary → governance
approval → publication → preservation → search → lineage → explainable trust → the
full event audit rebuilt by replay with zero dead letters. This is the artifact that
`docker run` executes by default (§4).

### 2.3 `npm run health` and `npm run seed`

- `npm run health` (`scripts/health.mts`) prints the platform health dashboard — every
  service plus the event bus.
- `npm run seed` (`scripts/seed.mts`) creates a sample organization with starter
  knowledge and prints the created ids, so you can inspect a populated platform.

---

## 3. The full verification gate

`npm run verify` is the **CI gate** and the definition of a mergeable change:

```bash
npm run verify   # lint && typecheck && fitness && test
```

| Command | Runs | Needs network |
|---|---|---|
| `npm run lint` | `eslint .` | yes (`npm ci` for eslint) |
| `npm run typecheck` | `tsc --build` | yes (`npm ci` for tsc) |
| `npm run fitness` | `node tools/fitness-checks/run.mjs` | no |
| `npm test` | Node test runner across all workspaces | no |
| `npm run build` | `tsc --build` (produces the shipped build) | yes |

Per the Constitution §7, "done" means production-ready (tests green, events
validated, observability + governance present, deploy verified) — not merely
compiling.

---

## 4. Container path — build, verify, and run the image

The root `Dockerfile` builds the monorepo, runs the full verification gates, and by
default executes the end-to-end reference demo so that `docker run` shows KMOS
working. It is a **build/verify/demo image**, not a server image (there is no
long-running process to serve yet).

```dockerfile
# Dockerfile (root)
FROM node:22-bookworm-slim AS base
WORKDIR /kmos
COPY package.json package-lock.json* ./
COPY . .
RUN npm ci || npm install
RUN npm run verify || (echo "verify failed" && exit 1)   # lint + typecheck + fitness + tests
CMD ["npm", "run", "demo"]                                # default: end-to-end demo
```

Build and run:

```bash
docker build -t kmos:rc .          # builds + runs the full verify gate at build time
docker run --rm kmos:rc            # runs `npm run demo` (the default CMD)
docker run --rm kmos:rc npm run verify:offline   # re-run the offline gate in the image
```

> **Note.** Because the image runs `npm run verify` during build, the build itself is
> the verification — a green `docker build` means lint + typecheck + fitness + the full
> test suite all passed. This requires the npm registry to be reachable at build time.

### 4.1 Root `docker-compose.yml` (image + Postgres + demo)

The root compose brings up Postgres (for the database tests / future persistence) and
runs the KMOS reference demo against it:

```bash
docker compose up           # starts Postgres, waits for healthy, builds + runs the demo
docker compose down         # stop (keeps the kmos-pgdata volume)
docker compose down -v      # stop and remove the Postgres volume
```

What it wires (see `docker-compose.yml`):

- **`postgres`** — image `pgvector/pgvector:pg16`; DB/user/password `kmos`; port
  `5432`; named volume `kmos-pgdata`; `pg_isready` healthcheck.
- **`kmos`** — built from the root `Dockerfile`; `depends_on` Postgres `service_healthy`;
  environment `KMOS_DATABASE_URL=postgres://kmos:kmos@postgres:5432/kmos`;
  `command: ["npm", "run", "demo"]`.

> The Postgres service is provisioned ahead of the live persistence adapters. Today
> the demo still uses in-memory stores; `KMOS_DATABASE_URL` becomes load-bearing once
> the async-kernel migration (KEP-001) lands and the Postgres `EventLog` adapter is
> wired live (§6).

### 4.2 Dev compose — local Postgres only

`deployment/docker/docker-compose.dev.yml` starts **only** Postgres — the single
polyglot backbone for the monolith-with-Postgres stage (event log + outbox +
relational + JSONB + pgvector + graph), behind repository ports (DECISIONS D-B):

```bash
docker compose -f deployment/docker/docker-compose.dev.yml up -d    # start Postgres
docker compose -f deployment/docker/docker-compose.dev.yml down     # stop (keeps volume)
```

Use this when you want a local database to develop the persistence adapters against,
while still running the KMOS process directly with `npm run …`.

---

## 5. Configuration

| Variable | Meaning | Status |
|---|---|---|
| `KMOS_DATABASE_URL` | Postgres connection string consumed by the (forthcoming) live Postgres adapters. Set by the root compose to `postgres://kmos:kmos@postgres:5432/kmos`. | Wired in compose / CI; load-bearing post-KEP-001. |

Secrets are **referenced, never inlined**: the Configuration Service persists a
`SecretReference` and resolves the clear value at runtime through the `SecretResolver`
port. The dev adapter is `EchoSecretResolver`; a Vault/KMS adapter is the production
swap (`OPERATIONS-GUIDE.md` §4). Never put a clear secret in a config value, a
committed env file, or a log line.

---

## 6. CI pipeline (`.github/workflows/ci.yml`)

CI runs on every push to `main` and every pull request. Three jobs:

### 6.1 `static` — Static checks (lint, fitness, typecheck)
`checkout → setup-node@22 (npm cache) → npm ci → lint → fitness → typecheck`. This is
the job that closes the lint/type half of the gate that the offline sandbox cannot run.

### 6.2 `tests` — Tests (needs `static`)
`npm ci`, then the full suite in stages: `test:unit`, `test:contract`,
`test:security`, `test:integration` (incl. concurrency + resilience), `test:perf`,
`test:certification`, and finally `npm run demo` as an end-to-end smoke.

### 6.3 `database` — Database tests against real PostgreSQL (needs `static`)
Spins up a `pgvector/pgvector:pg16` **service container** (user/password/db `kmos`,
port `5432`, `pg_isready` health options) with
`KMOS_DATABASE_URL=postgres://kmos:kmos@localhost:5432/kmos`, then runs
`npm run test:contract`. This is the job that **validates the async `EventLog` against a
real database once KEP-001 lands**; until then it exercises the EventLog contract
against the in-memory + fake-SQL adapters (the job and its DB are already in place,
ahead of the migration).

---

## 7. Production deployment roadmap (honest — not yet built)

There are **no Helm charts and no Kubernetes manifests in this repository**, and there
is intentionally none invented here. KMOS-0010 §4 and KMOS-0200 §17 are explicit: the
**logical architecture is identical across topologies — only the deployment topology
changes.** Because every service already exposes versioned contracts, publishes/consumes
canonical events, registers health, and publishes metrics, each is independently
extractable later **without** a logical rearchitecture.

### 7.1 Topology progression (modular-monolith-first → extractable services)

This mirrors `OPERATIONS-GUIDE.md` §2.1:

| Stage | Shape | Storage | Eventing | Status |
|---|---|---|---|---|
| 0 | Single process, all services in-process | In-memory adapters | In-process dispatch (kernel `EventBus`) | **Current** |
| 1 | Modular monolith on one host + Postgres | PostgreSQL (event log + outbox + relational + JSONB + pgvector + AGE) | In-process dispatch; outbox relay | Scaffolded (dev compose) |
| 2 | Containerised, extractable services | Postgres + object storage | Real broker via outbox/CDC | Roadmap |
| 3 | Kubernetes / Helm, services scale independently | Polyglot stores behind ports | Broker (Kafka/NATS) | Roadmap |

The same code moves across stages because storage, broker, IdP, and AI models are
ports (DECISIONS D-006); swapping an in-memory adapter for a Postgres or broker
adapter does not touch any service core.

### 7.2 What must exist before a server / Helm / K8s is meaningful

A clickable, installable server+UI and any Helm/K8s deployment depend on prior gated
work (`IMPLEMENTATION_STATUS.md` gap ledger):

1. **KEP-001 — async `EventLog` kernel migration** (the freeze prerequisite). One async
   `EventLog` port satisfied by both `InMemoryEventLog` and `PostgresEventLog`, an
   await-everywhere publication contract, validated against real Postgres in the CI
   `database` job. Plan: `engineering/review/07-KERNEL-EVOLUTION-PLAN.md`.
2. **Real persistence.** The Postgres `EventLog` adapter + DDL exist; they need a live
   DB plus migrations and live integration to be wired in (gated on #1).
3. **Pervasive identity / attribution** threaded through the (now-async) write paths —
   co-executed with #1 because they touch the same write paths.
4. **Real security** — OIDC/JWT, mTLS/SPIFFE, Vault/KMS secret backend,
   encryption-at-rest — which require running external services and a network.
5. **An HTTP API server** — a new long-running runtime that exposes the existing
   service/business APIs and wires health/metrics to probe endpoints; only then is a
   container *server* image (vs. today's build/verify/demo image) meaningful.
6. **A reference web UI** — browser code over the API server.

Only after #1–#5 does a Kubernetes deployment have something to run, scale, and probe.

### 7.3 What the Helm chart will contain when the server exists (specification, not shipped)

When the HTTP server (#5) lands, the Helm chart is expected to specify:

- A **Deployment** for the KMOS server (the modular monolith first), with liveness and
  readiness probes wired to the `@kmos/observability` `HealthRegistry`
  (`Ready`/`Degraded`/`Unavailable`).
- A **Service** for the HTTP API, and an **Ingress** (TLS terminated; mTLS where
  required by #4).
- **Postgres** connection via `KMOS_DATABASE_URL` from a Secret (managed DB or a
  Postgres subchart), holding the durable event log + outbox — the one thing that must
  be backed up to recover everything else by replay (`OPERATIONS-GUIDE.md` §6).
- **Secret references** resolved through Vault/KMS (the `SecretResolver` port), never
  inlined.
- **ConfigMaps** for non-secret configuration resolved by the Configuration Service.
- Per-service **HorizontalPodAutoscaler** policies once services are extracted (Stage
  2→3): search, the capability runtime, and the workflow engine scale with workload;
  identity/governance/configuration scale conservatively (`OPERATIONS-GUIDE.md` §8).
- A **broker** (Kafka/NATS) subchart and an outbox relay at Stage 2+, where in-process
  dispatch is replaced by durable broker hand-off with at-least-once, idempotent
  consumers.

Each item above is a forward specification. It will be authored as real charts in
`deployment/` only once the server it deploys exists.

---

## 8. References

- **Repository:** `package.json` (scripts), `Dockerfile` + `docker-compose.yml`
  (build/verify/demo + Postgres), `deployment/docker/docker-compose.dev.yml` (local
  Postgres), `.github/workflows/ci.yml` (static / tests / database jobs),
  `tools/fitness-checks/run.mjs`, `tools/dev/` (offline runner),
  `examples/knowledge-lifecycle-demo.mts` (the demo).
- **Companion docs:** `documentation/OPERATIONS-GUIDE.md` (operations, observability,
  DR, scaling, incident response), `documentation/SECURITY-REVIEW.md` (threat model +
  remediation backlog), `documentation/GETTING-STARTED.md`,
  `documentation/DEVELOPER-GUIDE.md`.
- **Engineering corpus:** `engineering/IMPLEMENTATION_STATUS.md` (the v1.0-RC gap
  ledger), `engineering/review/07-KERNEL-EVOLUTION-PLAN.md` (KEP-001),
  `engineering/DECISIONS.md` (D-B persistence, D-C deployment shape, D-E offline runner,
  D-006 ports-and-adapters).
- **Specs:** KMOS-0010 §4 (deployment model / topologies), KMOS-0200 §17 (monolith →
  extractable services).
