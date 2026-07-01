# KMOS Deployment Decision Guide

_Which way should you run KMOS? A side-by-side comparison of the realistic
deployment models, an explicit **verified vs. prepared-not-validated** status for
each, and one canonical recommendation for Olares._

_Grounded in the repository: `package.json` (`serve`), `Dockerfile`,
`docker-compose.yml`, `deployment/kubernetes/`, `deployment/helm/`,
`deployment/olares/`, and the env-driven composition root
(`applications/api-server/src/platform.ts`). Deeper per-target mechanics live in
[`DEPLOYMENT-TARGETS.md`](DEPLOYMENT-TARGETS.md); Olares specifics live in
[`OLARES-DEPLOYMENT-GUIDE.md`](OLARES-DEPLOYMENT-GUIDE.md)._

_Last updated: 2026-06-30 · Audience: platform operators, release engineers,
developers choosing a run model._

---

## 0. Honesty banner (read first)

> **Two** run models have now been exercised against real infrastructure:
> **docker-compose against a real PostgreSQL** in the engineering environment (the
> event log survived a restart; search rebuilt from the log), and the **Olares
> Application Chart on a real Olares instance** — the owner installed KMOS on their
> own Olares node ("mwayolares", 2026-06-30/07-01), Olares provisioned Postgres and
> KMOS booted durable, the full end-to-end workflow ran, and event-log durability
> survived an app restart on-node (77 → 79 events). See
> [`OLARES-DEPLOYMENT-GUIDE.md`](OLARES-DEPLOYMENT-GUIDE.md) §8. That Olares run was
> **verified by the owner operating their own Olares** (screenshot + event counts),
> not proven by an automated test. The image itself is **verified to build and
> self-verify** (`npm run verify` runs at build time, `Dockerfile`) and its published
> form (`docker.io/malikshahid85/kmos:1.0.0-pc.1`) was independently verified pullable
> and boots `/health`. The remaining models — raw Docker, raw Kubernetes, and Helm —
> are still **PREPARED, NOT VALIDATED**: authored from the repository sources and
> reviewable/renderable, but not exercised against a live cluster here. Status is
> stated per row below; never read "prepared" as "proven."

Two invariants apply to **every** model (from `platform.ts` and
`DEPLOYMENT-TARGETS.md`):

- **`KMOS_DATABASE_URL` set → durable PostgreSQL event log (system of record);
  unset → in-memory.** With a database, the event log survives restarts and the
  search projection is rebuilt from it on boot.
- **`replicas: 1`.** Read-model projections other than search are in-memory and
  per-pod (read-model persistence is roadmap), so no model is safe above one
  replica yet.

---

## 1. The models at a glance

| Model | Where it lives | One-line use case | Status |
|---|---|---|---|
| **Local dev — `npm run serve`** | `package.json`, `applications/api-server/` | Fastest inner loop; hack on the platform on your host | **Verified** (repo dev path) |
| **docker-compose** | `docker-compose.yml` | Local full stack (KMOS + Postgres) with a durable event log | **VERIFIED** — event-log durability across restart proven (§0) |
| **Raw Docker** | `Dockerfile` | Run the single container anywhere Docker runs; bring your own Postgres | Image **verified** to build/run; standalone `docker run` wiring **prepared** |
| **Raw Kubernetes manifests** | `deployment/kubernetes/` | Cluster deploy with plain `kubectl apply`, no Helm | **Prepared, not validated** |
| **Helm chart** | `deployment/helm/` | Templated, values-driven cluster deploy | **Prepared, not validated** (`helm template` renders offline) |
| **Olares Application Chart (OAC)** | `deployment/olares/` | Run KMOS as an Olares app, consuming Olares Postgres middleware | **VALIDATED on real Olares** — install accepted, durable Postgres persistence, restart-survival (77 → 79) on-node (§0); underlying container also verified |

---

## 2. Comparison across the dimensions that matter

| Dimension | Local `npm run serve` | docker-compose | Raw Docker | Raw K8s manifests | Helm | **Olares OAC** |
|---|---|---|---|---|---|---|
| **Use case** | Inner-loop dev, debugging | Local full stack / demo / container validation | Single-host container, CI, quick prod-ish run | Cluster deploy without Helm | Cluster deploy, values-driven, repeatable | Self-hosted personal-cloud app, middleware provided by Olares |
| **Operational complexity** | Lowest (Node + optional Postgres) | Low (one `compose up`) | Low–medium (you wire Postgres + secrets) | Medium–high (author/apply many manifests) | Medium (values + release lifecycle) | Medium; **Olares provisions Postgres for you** (declared middleware) |
| **Upgrade path** | `git pull` / restart | `compose up --build` (recreate) | Repull image, recreate container | `kubectl apply` (recreate at replicas:1) | `helm upgrade` (recreate at replicas:1) | Olares app update → **recreate at replicas:1** (rolling not yet safe, §0) |
| **Production suitability** | No (dev only) | No (local/dev) | Limited (single host, no orchestration) | Yes, on your cluster (replicas:1) | Yes, on your cluster (replicas:1) | Yes, on **your Olares** (replicas:1) — validated on-node (§0); confirm node-specific values on yours |
| **Developer experience** | Best — instant reload, host tooling | Very good — realistic + one command | Good — portable, minimal | Verbose — manual manifests | Good — parameterized, reviewable via `helm template` | Good — app-store-style lifecycle; middleware handled by Olares |
| **Maintainability** | N/A (not deployed) | Good for local | Manual — you own all wiring | Higher upkeep (drift across manifests) | Good — single source of values | Good — OAC bundles chart + manifest; tracks KMOS release |
| **Postgres** | Optional (`docker-compose.dev.yml` or none) | Bundled (`pgvector/pg16`) | Bring your own | External (Secret) | External (Secret/values) | **Consumed from Olares** middleware (`vectors` ext) |
| **Secrets** | Shell env | Compose env | `-e` / `--env-file` | K8s Secret → `KMOS_SECRET_*` | Secret/values → `KMOS_SECRET_*` | Olares env/secret → `KMOS_SECRET_*` |
| **Status** | Verified | **VERIFIED** | Image verified; wiring prepared | Prepared, not validated | Prepared, not validated | **VALIDATED on real Olares** (install + durable persistence + restart-survival); container also verified |

> All non-secret facts above trace to source: port **8080**, `GET /health`,
> `GET /metrics`, `KMOS_DATABASE_URL`, and the `KMOS_SECRET_` mapping are in
> `server.ts` / `index.ts` / `platform.ts` and `DEPLOYMENT-TARGETS.md` §0.

---

## 3. When to pick each

- **Local dev — `npm run serve`.** You are changing KMOS code. Run in-memory (no
  `KMOS_DATABASE_URL`) for speed, or point at a local Postgres
  (`deployment/docker/docker-compose.dev.yml`) when working on persistence.
- **docker-compose.** You want a realistic local stack, a demo, or to **reproduce
  the event-log durability evidence** (this is the validated model — see the §8
  verification in the Olares guide). Not a production topology.
- **Raw Docker.** A single host, CI, or a quick prod-ish run where you already have
  a Postgres and just need the one container. You own the Postgres, secret, and
  restart wiring by hand.
- **Raw Kubernetes manifests.** You run Kubernetes, avoid Helm, and want plain
  `kubectl apply` you can read line by line. Best when your platform already
  templates manifests some other way (Kustomize, GitOps).
- **Helm.** You run Kubernetes and want parameterized, repeatable, upgradeable
  releases with one values file. Prefer this over raw manifests for anything you
  maintain over time.
- **Olares Application Chart.** You are deploying to **Olares** — see §4.

---

## 4. Recommendation for Olares — one canonical approach

**On Olares, use the Olares Application Chart (`deployment/olares/`), consuming
Olares' PostgreSQL middleware for the durable event log.** It is the
Olares-native packaging model (Helm chart + `OlaresManifest.yaml`), it lets Olares
**provision and inject Postgres** rather than you bundling a database, it declares
the app entrance/permissions Olares expects, and it already pins the required
`replicas: 1`. Full procedure: [`OLARES-DEPLOYMENT-GUIDE.md`](OLARES-DEPLOYMENT-GUIDE.md).

> **Status:** the OAC is **VALIDATED on a real Olares instance** — the owner
> installed it on their Olares node ("mwayolares"), Olares provisioned Postgres and
> KMOS booted durable, the full end-to-end workflow ran, and event-log durability
> survived an app restart (77 → 79 events) on-node (§0;
> [`OLARES-DEPLOYMENT-GUIDE.md`](OLARES-DEPLOYMENT-GUIDE.md) §8.1). Still confirm the
> injected `.Values.postgres.*` key names and the entrance host on **your** Olares
> version ([`OLARES-DEPLOYMENT-GUIDE.md`](OLARES-DEPLOYMENT-GUIDE.md) §4.1). Note the
> open items that this run did **not** close: read-model *detail* recovery on boot is
> still roadmap (so `replicas` stays at 1), the identity → `CallContext` bridge is not
> wired (KMOS runs non-enforcing on Olares), and a rehearsed `pg_dump` backup/restore
> drill on the Olares Postgres is still pending.

### When to prefer something else instead of the OAC

- **You are NOT on Olares** — you run vanilla Kubernetes. Use **Helm**
  (`deployment/helm/`), or **raw manifests** (`deployment/kubernetes/`) if you avoid
  Helm. The OAC's value (Olares middleware injection, entrances, Studio) does not
  apply off-Olares.
- **You just want it running on one host** with a Postgres you control. Use **raw
  Docker** or **docker-compose** — no orchestration overhead.
- **You are developing or demoing locally.** Use **docker-compose** (realistic,
  durable) or **`npm run serve`** (fastest loop).
- **You need multi-replica / zero-downtime rolling upgrades today.** No model
  supports this yet — read-model persistence is roadmap; all models run
  `replicas: 1` and upgrade by **recreate** (§0).

---

## 5. References

- **Verified sources:** `package.json` (`serve`), `Dockerfile` (self-verifying
  build, `EXPOSE 8080`, CMD `npm run serve`), `docker-compose.yml` (validated
  stack), `applications/api-server/src/platform.ts` (`createPlatformFromEnv`,
  durable event log, read-model caveat), `applications/api-server/src/index.ts`,
  `applications/api-server/src/server.ts` (`/health`, `/metrics`, endpoints).
- **Deployment artifacts:** `deployment/kubernetes/`, `deployment/helm/`,
  `deployment/olares/`, `deployment/docker/docker-compose.dev.yml`.
- **Companion docs:** [`OLARES-DEPLOYMENT-GUIDE.md`](OLARES-DEPLOYMENT-GUIDE.md),
  [`DEPLOYMENT-TARGETS.md`](DEPLOYMENT-TARGETS.md),
  [`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md),
  [`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md),
  [`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md),
  [`UPGRADE-GUIDE.md`](UPGRADE-GUIDE.md).
- **ADRs:** [ADR-0009](adr/0009-async-eventlog-kernel-migration.md) (system of
  record; format-stable, additive-only log).
