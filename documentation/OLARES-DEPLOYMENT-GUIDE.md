# KMOS on Olares — Deployment Guide

_How to run KMOS as an Olares Application, what KMOS owns versus what it consumes
from Olares, and how to install, configure, upgrade, back up, and remove it — with
every Olares-instance-specific step marked for verification on **your** node._

_Grounded in the repository: the Olares Application Chart
(`deployment/olares/OlaresManifest.yaml`, `Chart.yaml`, `values.yaml`,
`templates/deployment.yaml`, `templates/service.yaml`), the env-driven composition
root (`applications/api-server/src/platform.ts` — `createPlatformFromEnv`), the
server (`applications/api-server/src/server.ts`, `index.ts`), the container build
(`Dockerfile`), the container-level validation performed against
`docker-compose.yml`, and a **verified run on a real Olares instance** ("mwayolares",
2026-06-30/07-01) reported by the owner. Olares packaging facts are from
docs.olares.com (Developer → Package)._

_Last updated: 2026-06-30 · Audience: platform operators, release engineers,
Olares node administrators._

Companion docs: [`DEPLOYMENT-DECISION-GUIDE.md`](DEPLOYMENT-DECISION-GUIDE.md)
(which deployment model to pick), [`DEPLOYMENT-TARGETS.md`](DEPLOYMENT-TARGETS.md)
(the container/secret/replica model shared by all targets),
[`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md) and
[`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md) (log-centric backup / rebuild-by-replay),
[`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md) (run-time operations),
[`UPGRADE-GUIDE.md`](UPGRADE-GUIDE.md).

---

## 0. Honesty banner (read first)

> **KMOS has been VERIFIED running on a real Olares instance.** On 2026-06-30/07-01
> the owner installed KMOS on their own Olares node ("mwayolares") via the Olares
> Application Chart under `deployment/olares/` (packaged as a `.tgz` and uploaded
> through **Market → My Olares → Upload custom chart**). Olares **accepted** the
> `OlaresManifest.yaml` + chart, **provisioned PostgreSQL** (the
> `middleware.postgres` declaration) and injected the connection, and KMOS **booted
> with a durable event log**. The app came up live at an Olares entrance URL
> (`https://<id>.mwayolares.olares.com`, header showing "platform healthy"), the
> full end-to-end workflow ran on-node, and **event-log durability survived an app
> restart** on Olares (see [§8, Verification](#8-verification)). This was **verified
> by the owner operating their own Olares** and reporting the observations
> (screenshot + event counts) — not proven by an automated test.
>
> The **container** — the same image the chart deploys — was independently validated
> against a real PostgreSQL via `docker compose`, including durability of the
> canonical event log across a restart; that evidence remains and complements the
> on-Olares run.
>
> **Still open (the Olares run did NOT close these — they remain roadmap):** full
> **read-model recovery on boot** (the event log and search index recover after a
> restart, but repository-backed object *detail* — `GET /knowledge/:id` — is **not**
> re-projected from the log; this is why `replicas` MUST stay at **1**, §1.4); the
> Olares **identity → KMOS `CallContext`** attribution bridge (KMOS runs
> **non-enforcing** on Olares today); a **distributed tracing** backend; a rehearsed
> **`pg_dump` backup + restore drill** on the Olares Postgres; and a repository
> **LICENSE** (owner decision). Node-version-specific placement details are still
> marked **[verify on your Olares]** throughout.

---

## 1. Architecture on Olares — what KMOS owns vs. consumes

KMOS is a **modular monolith**: one deployable `api-server` process that composes
every platform service, engine, and domain in-process on a single canonical event
bus (`applications/api-server/src/platform.ts`; `OPERATIONS-GUIDE.md` §1). On
Olares, KMOS keeps that shape and treats Olares as the **infrastructure substrate**
underneath it.

### 1.1 KMOS OWNS (ships inside the image, is never delegated to Olares)

- **The canonical event log — the system of record.** The append-only `events`
  table is institutional memory; every read model is derived from it. KMOS owns its
  schema (`EVENTS_TABLE_DDL`), its append-only invariant, and its replay-based
  recovery model. Olares supplies the *Postgres process*; KMOS owns *what lives in
  it and how it is used*.
- **All platform services and engines** — events, identity, assets, knowledge,
  governance, capability-registry, capability-runtime, search — plus the domain
  services (media, language, publishing, preservation) and reference applications
  (Knowledge Studio, Archive Explorer). These are wired in-process by
  `wireServices()` and are entirely internal to the container.
- **The HTTP surface** — `GET /` (reference UI), `GET /health`, `GET /metrics`, and
  the canonical write endpoints (`applications/api-server/src/server.ts`).
- **Attribution enforcement (CRIT-2)** — toggled by `KMOS_ENFORCE`.

### 1.2 KMOS CONSUMES from Olares (today — VERIFIED on a real Olares instance)

| Olares middleware | KMOS use | Wiring | Status |
|---|---|---|---|
| **PostgreSQL** (with the `vectors`/pgvector extension) | Durable backing for the **canonical event log** (system of record) via `KMOS_DATABASE_URL` | `OlaresManifest.yaml` `middleware.postgres` → Olares injects `.Values.postgres.*` → `templates/deployment.yaml` builds `KMOS_DATABASE_URL` | **VERIFIED on real Olares** — Olares provisioned Postgres from the `middleware.postgres` declaration, injected the connection, and KMOS booted durable; event-log durability survived an app restart on-node (§8). Also independently validated at the container level against `pgvector/pgvector:pg16` (§8) |

KMOS bundles **no database of its own** on Olares. The manifest *declares* the
Postgres middleware and *consumes* the connection details Olares injects — matching
Olares' packaging model (middleware is declared and consumed, not bundled).

> The chart maps the injected values into a DSN as
> `postgres://{{ .Values.postgres.username }}:{{ .Values.postgres.password }}@{{ .Values.postgres.host }}:{{ .Values.postgres.port }}/{{ .Values.postgres.databases.kmos }}`.
> The **exact injected key names** are Olares-version-specific — **[verify on your
> Olares]** against your version's middleware documentation before install.

### 1.3 KMOS could CONSUME from Olares (ROADMAP — not wired today)

The following are **not implemented** in the current image or chart. They are the
intended future consumption of Olares capabilities and are listed so the
architecture is honest about direction, not to imply present function. **Do not
rely on any of these on Olares today.**

- **MinIO (object storage)** — for asset *bytes*. Today the event log records an
  asset's `storageRef` and SHA-256 checksum, **not the bytes**
  (`BACKUP-AND-RESTORE.md` §2). Durable byte storage is roadmap.
- **Redis / KVRocks** — for caching and deduplication. **Roadmap.**
- **Ollama / ComfyUI / Speaches** — as AI capability *workers* behind the
  capability-runtime seam (LLM, image, speech). **Roadmap.**
- **Olares identity / ingress / monitoring** — deeper integration: mapping Olares'
  authenticated user into an enforcing KMOS `CallContext`, Olares-managed ingress,
  and Prometheus scraping of `/metrics` by Olares monitoring. The chart *exposes*
  `/metrics` and declares an `entrance`, but the **identity → CallContext mapping is
  roadmap** (today `KMOS_ENFORCE` requires an actor but the server only echoes the
  `x-kmos-actor` header; `server.ts`).

### 1.4 The one caveat that shapes every operational choice below

Only the **event log** (durable in Postgres) and the **search projection** (rebuilt
from the log on boot) recover across restarts. **Repository-backed object detail —
e.g. `GET /knowledge/:id` — is NOT rebuilt from the log on boot.** That is the
tracked **read-model-persistence** roadmap item
(`platform.ts` `createPlatformFromEnv` doc comment). Consequences, enforced below:

- **Run `replicas: 1`.** In-memory projections are per-pod; a second pod would serve
  divergent read state. The chart already pins `replicas: 1`
  (`templates/deployment.yaml`) — **do not raise it.**
- **Each restart appends two benign boot lifecycle events** (`IndexCreated` +
  `IndexRebuilt`) from the search rebuild. This is expected; account for it when you
  assert event counts (§7, §8).

---

## 2. Prerequisites

| Requirement | Detail | Status |
|---|---|---|
| A running Olares node/cluster you administer | Olares `>= 1.11.0-0` (declared in `OlaresManifest.yaml` `options.dependencies`) | **[verify on your Olares]** |
| Olares **PostgreSQL** middleware available | With the `vectors` (pgvector-equivalent) extension | **[verify on your Olares]** |
| A published KMOS **image** reachable by your node | Built from this repo's `Dockerfile`; CMD is `npm run serve`, `EXPOSE 8080`, ~431 MB (`node:22-bookworm-slim`). Set `image.repository`/`image.tag` in `values.yaml`. Published image: `docker.io/malikshahid85/kmos:1.0.0-pc.1` (public Docker Hub, built + pushed by `.github/workflows/release-image.yml`) | Image **builds and self-verifies** (`npm run verify` runs at build time); the published image was **independently verified pullable and boots `/health`**, and is the image the on-Olares run deployed — verified |
| **Olares Studio** for pre-submission testing | Olares' recommended step: test the app in a real Olares environment via Studio before submission | **[verify on your Olares]** |
| Architectures | `amd64`, `arm64` (`OlaresManifest.yaml` `spec.supportArch`) | Declared; **[verify on your Olares]** |

Resource envelope declared in `OlaresManifest.yaml` `spec` (required/limited):
memory 256Mi / 1Gi, CPU 250m / 1, disk 256Mi / 2Gi. These are declared defaults,
not measured production figures — **tune against your workload.**

---

## 3. Install via the Olares Application Chart (OAC)

An **Olares Application Chart = a Helm chart (`Chart.yaml` + `templates/`) PLUS an
`OlaresManifest.yaml`**. KMOS's OAC lives in `deployment/olares/`:

```
deployment/olares/
  OlaresManifest.yaml     # Olares app metadata, entrances, middleware, permissions
  Chart.yaml              # Helm chart identity (name: kmos, appVersion: 1.0.0-pc.1)
  values.yaml             # image, injected postgres.* placeholders, resources, enforce
  templates/
    deployment.yaml       # KMOS Deployment: port 8080, KMOS_DATABASE_URL, probes, replicas:1
    service.yaml          # ClusterIP Service on 8080
```

### 3.1 Render and review locally (no Olares needed) — verified path

Because it is a Helm chart, you can render it offline to review the manifests
before touching a node. The `postgres.*` placeholders in `values.yaml` exist purely
to let this render:

```bash
helm template kmos deployment/olares \
  --set image.repository=YOUR_REGISTRY/kmos \
  --set image.tag=1.0.0-pc.1
```

Review that the rendered Deployment has `replicas: 1`, `containerPort: 8080`,
`/health` liveness/readiness probes, and a `KMOS_DATABASE_URL` built from the
`postgres.*` values.

### 3.2 Install on Olares — VERIFIED path (owner ran this on "mwayolares")

The install path below was **executed by the owner on a real Olares instance**
("mwayolares", 2026-06-30/07-01). The exact upload UI and injected key names remain
Olares-version-specific, so per-node details are still marked **[verify on your
Olares]**.

1. **Publish the KMOS image** to a registry your Olares node can pull, and set
   `image.repository` / `image.tag` in `values.yaml` accordingly. The verified run
   used `docker.io/malikshahid85/kmos:1.0.0-pc.1` (public Docker Hub).
2. **Package the OAC and upload it as a custom chart.** In the verified run the OAC
   (`deployment/olares/`) was packaged as a **`.tgz`** and uploaded via **Market →
   My Olares → Upload custom chart**. Olares **accepted** the `OlaresManifest.yaml`
   + chart. (Olares Studio remains a valid alternative pre-submission path —
   **[verify on your Olares]**.)
3. **Install the app.** On install, Olares read `OlaresManifest.yaml`, **provisioned
   the declared `postgres` middleware** (the `kmos` database/user with the `vectors`
   extension), **injected the connection values**, and rendered + applied the Helm
   templates — KMOS **booted with a durable event log** (verified, §8). The exact
   injected key names are still version-specific — **[verify on your Olares]**.
4. **Reach KMOS** through the declared entrance (`OlaresManifest.yaml` `entrances`:
   name `kmos`, port `8080`, `authLevel: private`). In the verified run the app was
   live at an Olares entrance URL (`https://<id>.mwayolares.olares.com`) with the
   header showing **"platform healthy"**. Your entrance host will differ —
   **[verify on your Olares]**.

> On first boot the server logs `event log: PostgreSQL (durable event log)` when
> `KMOS_DATABASE_URL` is set (`index.ts`). If it logs `in-memory`, the middleware
> injection did not reach the container — fix the DSN wiring before proceeding.

---

## 4. Configuration

KMOS is entirely **environment-configured**; the chart sets exactly what the server
reads.

| Variable | Meaning | Set by | Source |
|---|---|---|---|
| `PORT` | Listen port (default 8080) | `templates/deployment.yaml` (`"8080"`) | `index.ts` |
| `KMOS_DATABASE_URL` | DSN for the durable event log. **Set → PostgreSQL system of record; unset → in-memory** | Built from Olares-injected `.Values.postgres.*` in `templates/deployment.yaml` | `platform.ts` `createPlatformFromEnv` |
| `KMOS_ENFORCE` | `true` turns on CRIT-2 attribution enforcement (every published fact must carry an actor) | `.Values.enforce` (default `false`) | `platform.ts`, `index.ts` |
| `KMOS_SECRET_*` | Any secret KMOS resolves at runtime (`EnvSecretResolver`) | Olares env/secret mechanism | `DEPLOYMENT-TARGETS.md` §0.2 |

### 4.1 `KMOS_DATABASE_URL` injection (the load-bearing wiring)

`OlaresManifest.yaml` declares the middleware:

```yaml
middleware:
  postgres:
    username: kmos
    databases:
      - name: kmos
        extensions:
          - vectors
```

Olares injects the connection details as `.Values.postgres.*`, and
`templates/deployment.yaml` assembles the DSN. The `.Values.postgres.*` values in
`values.yaml` are **placeholders for local rendering only** — Olares overrides them.
**[verify on your Olares that the injected key names match what the template
consumes: `host`, `port`, `username`, `password`, `databases.kmos`.]**

### 4.2 Secrets (`KMOS_SECRET_*`)

KMOS resolves secret references from the environment with the `KMOS_SECRET_` prefix,
upper-snake-cased (`DEPLOYMENT-TARGETS.md` §0.2):

```
reference "db/password"  ->  env var KMOS_SECRET_DB_PASSWORD
```

Provide any required `KMOS_SECRET_*` values through Olares' secret/env mechanism.
Never inline secrets into config or logs. The DB password today flows through the
Olares-injected `postgres.password` into the DSN; treat it as a secret in your
Olares configuration.

### 4.3 Attribution enforcement (`KMOS_ENFORCE`)

`enforce: false` in `values.yaml` keeps the reference composition non-enforcing.
Setting `enforce: true` requires every published canonical fact to carry an acting
`actorId`. **Caveat:** the server currently only *echoes* the `x-kmos-actor` header
(`server.ts`); mapping Olares' authenticated user into an enforcing `CallContext` is
**roadmap** (§1.3). Enable `KMOS_ENFORCE=true` only once your callers actually
supply an actor, or writes will be rejected.

---

## 5. Upgrade procedure

**The persisted event format is additive-only and stable** — old logs replay
unchanged across code upgrades ([ADR-0009](adr/0009-async-eventlog-kernel-migration.md);
`DISASTER-RECOVERY.md` §5; `UPGRADE-GUIDE.md` §5). This is what makes upgrades safe
at the data level: a new KMOS version reads an old event log without migration.

**But rolling upgrades are NOT yet safe.** Because read-model projections are
in-memory and per-pod (§1.4), two pods (old + new) briefly coexisting during a
rolling update would serve divergent read state. Therefore:

1. **Take a fresh event-log backup first** (§6, `UPGRADE-GUIDE.md` §1) — always have
   a known-good log before upgrading.
2. **Recreate, do not roll.** Use a **Recreate** strategy at **`replicas: 1`**: stop
   the old pod, then start the new one. On Olares, upgrade the app to the new
   `image.tag` in a way that replaces the single pod rather than running two
   concurrently. **[verify on your Olares that the app update performs a recreate,
   not a surge, at replicas:1.]**
3. **On boot the new pod** runs the idempotent `EVENTS_TABLE_DDL`, then rebuilds the
   search projection from the durable log (`platform.ts`). Expect the two benign
   boot lifecycle events (§1.4).
4. **Verify** (§7): `/health` `status: ok`, `deadLetters: 0`; `events` count equals
   the pre-upgrade count **plus** the two boot events; a known concept is still
   found via `GET /knowledge?q=...`.

Rolling/zero-downtime upgrades become available only once read-model persistence
lands and multi-replica is validated.

---

## 6. Backup & restore

KMOS's recovery model is **back up the log, rebuild everything else by replay**
(`BACKUP-AND-RESTORE.md`, `DISASTER-RECOVERY.md`). On Olares this means backing up
the **Olares Postgres** `events` table.

### 6.1 Back up the event log

```bash
# Dump ONLY the append-only events table from the KMOS database.
pg_dump "$KMOS_DATABASE_URL" --table=events --format=custom --file=kmos-events.dump
```

Because the table is append-only (no `UPDATE`/`DELETE`), a dump is a consistent
point-in-time cut up to the highest `sequence`. Prefer continuous archival / PITR
for production RPO; `pg_dump` is the right coarse snapshot and the mandatory
pre-upgrade safety copy (`BACKUP-AND-RESTORE.md` §3). On Olares, run this against the
Olares-managed Postgres for the `kmos` database — **[verify how your Olares exposes
that connection for administrative backup]**.

### 6.2 Restore + rebuild-by-replay

1. **Restore the log** into the (restored/fresh) Postgres:
   `pg_restore --dbname="$KMOS_DATABASE_URL" kmos-events.dump`
   (`BACKUP-AND-RESTORE.md` §4.1).
2. **Start KMOS** at `replicas: 1`. It runs the idempotent DDL and **rebuilds the
   search projection by replaying the log** on boot (`platform.ts`). Other
   projections are reconstructed by replay as the normal path (`DISASTER-RECOVERY.md`
   §3).
3. **Verify** the restore (§7): `/metrics` `kmos_events_total` should match the
   restored log size (allowing for boot lifecycle events on each start).

The rebuild-by-replay guarantee is locked by
`testing/resilience/disaster-recovery.test.ts` — full derived state is
reconstructable from the immutable log, and recovery never mutates history
(`DISASTER-RECOVERY.md` §4). See [`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md) and
[`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md) for the full model, RPO/RTO framing,
and asset-byte handling (asset bytes are roadmap on Olares, §1.3).

---

## 7. Removal / uninstall

1. **Back up the event log first** (§6.1) if you might want the institutional memory
   back — uninstalling the app may reclaim the Postgres middleware and its data.
   **[verify on your Olares whether uninstall deletes the middleware volume.]**
2. **Uninstall the KMOS app** through Olares (the OAC lifecycle). This removes the
   Deployment, Service, and entrance. **[verify on your Olares.]**
3. **Decide on the middleware.** If uninstall does not remove the Postgres data and
   you want a clean slate, remove it explicitly; if you want to keep institutional
   memory, retain it and your kept `kmos-events.dump`. **[verify on your Olares.]**

Because the system of record is the log, a clean reinstall + restore of the dump
reconstructs the full institution (§6.2).

---

## 8. Verification

This section has **two independent bodies of evidence**: the **on-Olares run** (§8.1,
the owner exercising KMOS on their real Olares node) and the **container-level run**
(§8.2, `docker compose` against real PostgreSQL). They corroborate the same
load-bearing property — a durable event log that survives a restart and rebuilds its
search projection by replay.

### 8.1 What was VERIFIED on a real Olares instance ("mwayolares", 2026-06-30/07-01)

Verified by the **owner operating their own Olares** and reporting the observations
(screenshot + event counts) — this was a personally observed run, **not** an
automated test:

- **Install accepted.** The OAC (`deployment/olares/`, packaged as a `.tgz` and
  uploaded via Market → My Olares → Upload custom chart) was accepted; Olares
  **provisioned PostgreSQL** from the `middleware.postgres` declaration and injected
  the connection, and KMOS **booted with a durable event log**.
- **Live entrance.** The app was reachable at an Olares entrance URL
  (`https://<id>.mwayolares.olares.com`); the header showed **"platform healthy"**.
- **Full end-to-end workflow ran on-node:** created an organization + identity (real
  `kmos:` IDs); imported and **transcribed a lecture** (media → workflow reached
  **Completed**); **extracted concepts + multilingual vocabulary** (language →
  knowledge); and **search found the concept**.
- **DURABILITY VERIFIED across a restart.** With **~77 events** after the operations,
  an app **restart on Olares** left the count at **79** — i.e. the 77 persisted
  events survived and the restart appended the **2 benign boot lifecycle events**
  (`IndexCreated` + `IndexRebuilt`, §1.4). An in-memory event log would have reset to
  ~1; the durable Postgres-backed log did not.

**What this run did NOT establish (still roadmap):** repository-backed object
**detail** recovery on boot — `GET /knowledge/:id` is still not re-projected from the
log after a restart (§1.4, §8.4), which is why `replicas` MUST stay at **1**; the
Olares **identity → `CallContext`** attribution bridge (KMOS ran **non-enforcing** on
Olares); a **distributed tracing** backend; a rehearsed **`pg_dump` backup + restore
drill** on the Olares Postgres; and a repository **LICENSE**.

### 8.2 What was validated at the container level (against real pgvector/pg16)

Using the repository's `docker-compose.yml` (Postgres `pgvector/pgvector:pg16` with a
persistent volume + the KMOS container with
`KMOS_DATABASE_URL=postgres://kmos:kmos@postgres:5432/kmos`):

- The server logged **`event log: PostgreSQL (durable event log)`** on boot — the
  durable path in `createPlatformFromEnv` (`platform.ts`, `index.ts`).
- **3 × `POST /knowledge` writes produced 8 events**, confirmed present in Postgres.
- After **`docker compose restart kmos`**, the **3 `ConceptCreated` events
  SURVIVED** (still visible in Postgres) — the event log is durable across a
  restart because the Postgres volume persists.
- **`GET /knowledge?q=Sincerity` still found the concept** after the restart — the
  **search projection was rebuilt from the durable log** on boot.
- **`/health`** returned `{ status: "ok", events, deadLetters }` and **`/metrics`**
  returned Prometheus text — both work.

This exercises exactly the Olares-relevant wiring: `KMOS_DATABASE_URL` → durable
event log → survives restart → search rebuilt by replay — the same property the
on-Olares run (§8.1) confirmed on a real node.

### 8.3 Reproduce the container-level run locally

```bash
# 1. Build (runs the full verify gate) and start Postgres + KMOS.
docker compose up --build -d

# 2. Confirm the durable path and baseline health.
docker compose logs kmos | grep "durable event log"     # expect the PostgreSQL line
curl -s localhost:8080/health                            # { "status": "ok", "events": N, "deadLetters": 0 }

# 3. Write knowledge (repeat with different names to add events).
curl -s -X POST localhost:8080/knowledge \
  -H 'content-type: application/json' \
  -d '{"canonicalName":"Sincerity","definition":"...","category":"Concept"}'

# 4. Restart ONLY the app; Postgres (and its volume) stays up.
docker compose restart kmos

# 5. Prove durability + rebuild-by-replay.
curl -s "localhost:8080/knowledge?q=Sincerity"           # still finds the concept
curl -s localhost:8080/metrics | grep kmos_events_total  # count reflects the durable log
```

### 8.4 Known, expected behaviours to account for

- **Boot lifecycle events.** Each restart appends `IndexCreated` + `IndexRebuilt`
  (2 events) from the search rebuild — benign, but it means the post-restart event
  count is *slightly higher* than pre-restart, not identical (§1.4).
- **Object detail is not rebuilt on boot.** `GET /knowledge/:id` will not return
  detail reconstructed from the log after a restart — only the event log and search
  projection recover (§1.4). This is the read-model-persistence roadmap item.

---

## 9. Operational checklist

Run through this on your Olares node after install and after every restart/upgrade:

- [ ] **`GET /health`** returns HTTP 200 `{ "status": "ok", "events": <n>, "deadLetters": 0 }`.
- [ ] **`GET /metrics`** returns Prometheus text starting with `# KMOS platform metrics`.
- [ ] Server logs **`event log: PostgreSQL (durable event log)`** (not `in-memory`) —
      confirms `KMOS_DATABASE_URL` injection worked.
- [ ] **`replicas: 1`** — never raised (in-memory projections are per-pod, §1.4).
- [ ] After a restart, the **event count increased by the 2 boot events** and a
      known concept is **still found** via `GET /knowledge?q=...` (durability +
      rebuild).
- [ ] A **pre-upgrade `pg_dump` of the `events` table** exists (§6.1).
- [ ] `KMOS_ENFORCE` is only `true` if callers actually supply an actor (§4.3).
- [ ] Required `KMOS_SECRET_*` values are present in the container environment and
      never inlined into logs.

**The core of this checklist has now been exercised on a real Olares instance** by
the owner on "mwayolares" — durable-log boot, the live entrance, the end-to-end
workflow, and event-count durability across a restart (77 → 79) all held on-node
(§8.1). The `pg_dump` backup/restore drill and enforcement/secret items were **not**
part of that run and remain to be confirmed on **your** Olares — as do all
node-specific values (entrance host, injected key names).

---

## 10. References

- **Olares Application Chart:** `deployment/olares/OlaresManifest.yaml`,
  `Chart.yaml`, `values.yaml`, `templates/deployment.yaml`,
  `templates/service.yaml`.
- **Verified source:** `applications/api-server/src/platform.ts`
  (`createPlatformFromEnv`, durable event log, search rebuild, read-model caveat),
  `applications/api-server/src/index.ts` (port 8080, `serve`, backing log line),
  `applications/api-server/src/server.ts` (`/health`, `/metrics`, write endpoints),
  `Dockerfile` (self-verifying build, `EXPOSE 8080`, CMD `npm run serve`),
  `docker-compose.yml` (the validation harness).
- **ADRs:** [ADR-0009](adr/0009-async-eventlog-kernel-migration.md) (system of
  record; format-stable, additive-only log).
- **Companion docs:** [`DEPLOYMENT-DECISION-GUIDE.md`](DEPLOYMENT-DECISION-GUIDE.md),
  [`DEPLOYMENT-TARGETS.md`](DEPLOYMENT-TARGETS.md),
  [`BACKUP-AND-RESTORE.md`](BACKUP-AND-RESTORE.md),
  [`DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md),
  [`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md),
  [`UPGRADE-GUIDE.md`](UPGRADE-GUIDE.md).
- **Olares packaging model:** docs.olares.com → Developer → Package (OlaresManifest;
  Application Chart = Helm chart + OlaresManifest; middleware declared & consumed;
  test via Olares Studio before submission).
