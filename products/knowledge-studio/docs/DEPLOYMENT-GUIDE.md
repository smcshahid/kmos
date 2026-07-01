# Knowledge Studio — Deployment Guide

Audience: DevOps engineers and operators deploying Knowledge Studio, the flagship
application (#001) of the KMOS ecosystem.

This guide covers how to run Knowledge Studio from local development through a durable,
production-style deployment. For day-2 operations (health, backup/restore, scaling,
upgrades, runbook) see [`OPERATIONS-GUIDE.md`](OPERATIONS-GUIDE.md).

---

## 1. Overview & topology

Knowledge Studio is a **thin product layer over KMOS**. It is a single Node.js service
that **composes the KMOS platform in-process** — there is no separate KMOS server to
deploy, no service mesh, no message broker to stand up. The Studio process wires the KMOS
platform (Assets, Knowledge, Governance, Identity, Workflow, Capabilities, Search) inside
its own address space and serves a UI plus a small HTTP API on top of it.

```
                 ┌─────────────────────────────────────────────┐
   HTTP :8090 ──►│  Knowledge Studio process (Node 22+)         │
                 │   ├─ HTTP server  (UI at /, API at /api/*)   │
                 │   ├─ StudioService (orchestration + UX only) │
                 │   └─ KMOS platform (in-process)              │
                 │        Assets · Knowledge · Governance ·     │
                 │        Identity · Workflow · Capabilities ·  │
                 │        Search · EventLog                     │
                 └──────────────────────┬──────────────────────┘
                                        │ (only when KMOS_DATABASE_URL is set)
                                        ▼
                              ┌──────────────────────┐
                              │  PostgreSQL          │
                              │  canonical EventLog  │
                              │  (system of record)  │
                              └──────────────────────┘
```

The single external dependency is **optional PostgreSQL**. When present it backs the
canonical KMOS EventLog — the system of record — making knowledge durable across
restarts. When absent, Studio runs fully in-memory (ephemeral; suitable for demo and
dev).

Because Studio holds some per-source job state in-process (see the Operations Guide for
the precise persistence model), **run a single replica** for now.

---

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 22+** | The repo declares `"engines": { "node": ">=22" }`. Studio uses native TypeScript execution; older Node will not start. |
| **KMOS monorepo** | Studio is a workspace inside the KMOS monorepo and is started from the **repo root**. |
| **PostgreSQL 13+** (optional) | Only required for durable, restart-safe knowledge. Any standard/managed Postgres reachable via a connection URL. |
| **Docker** (optional) | For the container path in §5. Build context is the repo root. |

No other infrastructure is required for the V1 verifiable-knowledge core. Transcription,
YouTube download, and clip rendering are deferred capabilities (see §9).

---

## 3. Quick start (npm, in-memory)

From the **repository root**:

```bash
npm install
npm run studio
```

Studio listens on `PORT` (default **8090**):

- UI: `http://localhost:8090/`
- Health: `http://localhost:8090/health` → `{"status":"ok","sources":N}`

On startup the process logs the listening address and the event-log backing:

```
Knowledge Studio listening on http://localhost:8090  (UI at /, health at /health)
  KMOS event log: in-memory
```

In this mode nothing is persisted — restarting the process starts from an empty
knowledge base. This is the correct mode for demos, local development, and CI.

---

## 4. Production run (durable + enforcement)

For a durable, restart-safe knowledge base, set `KMOS_DATABASE_URL`. For attribution
enforcement (every canonical fact must carry an acting actor), set `KMOS_ENFORCE=true`.

```bash
export PORT=8090
export KMOS_DATABASE_URL="postgres://kmos:secret@db-host:5432/kmos"
export KMOS_ENFORCE=true
npm run studio
```

Startup then logs:

```
  KMOS event log: PostgreSQL (durable event log)
```

On boot, when `KMOS_DATABASE_URL` is set, Studio:

1. Runs the events-table DDL **idempotently** (safe on an existing database).
2. **Rehydrates every service read model** from the durable log — Knowledge, Assets,
   Governance, Identity, and the Capability registry (ADR-0011).
3. **Rebuilds the search projection** from the rehydrated state.

The result: a restarted Studio serves **identical knowledge, lineage, and trust**. See
the Operations Guide for exactly what is and is not restored.

---

## 5. Docker

The Studio image builds the whole monorepo and **runs the full verification gates
(lint + typecheck + fitness + tests) at build time** — the image is self-proving: if it
builds, the platform it contains passed its own gates.

```bash
# build context MUST be the repo root
docker build -f products/knowledge-studio/Dockerfile -t knowledge-studio .

# ephemeral (in-memory)
docker run -p 8090:8090 knowledge-studio

# durable (Postgres-backed canonical event log)
docker run -p 8090:8090 \
  -e KMOS_DATABASE_URL="postgres://kmos:secret@db-host:5432/kmos" \
  -e KMOS_ENFORCE=true \
  knowledge-studio
```

The image is `node:22-bookworm-slim`, installs dependencies, runs `npm run verify`,
exposes 8090, and starts with `npm run studio`. Because verification runs at build time,
expect the build to take longer than a plain compile — this is intentional.

---

## 6. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8090` | HTTP listen port. |
| `KMOS_DATABASE_URL` | *(unset)* | When set, the canonical EventLog is backed by real PostgreSQL. The events-table DDL runs idempotently on boot, all read models rehydrate, and the search projection rebuilds — durable, restart-safe knowledge. **Unset = fully in-memory (ephemeral; demo/dev).** |
| `KMOS_ENFORCE` | `false` | When `true`, attribution enforcement is on: every canonical fact must carry an acting actor. Recommended for production. |

There are no other required variables. Keep `KMOS_DATABASE_URL` out of source control —
source it from a secret store (see §8).

---

## 7. PostgreSQL setup notes

- **Provisioning.** Use a managed PostgreSQL where possible. Studio needs one database
  and a role with rights to create its events table and read/write it. The **DDL is
  applied automatically and idempotently on boot** — you do not run a migration step by
  hand.
- **Connection URL.** Standard form:
  `postgres://<user>:<password>@<host>:<port>/<database>`.
- **Sizing.** The event log grows append-only; size it for retention, not throughput. A
  single-writer workload (one Studio replica) is modest.
- **Backups.** The event log is the **system of record** — restoring it restores all
  knowledge, lineage, and trust. Enable automated backups / point-in-time recovery. See
  the Operations Guide for backup/restore procedure.
- **TLS.** For managed Postgres, use the provider's TLS-enabled connection string
  (e.g. `?sslmode=require`) per your environment's policy.

---

## 8. Kubernetes / Olares approach

KMOS already ships reference deployment assets under
[`deployment/`](../../../deployment) for the KMOS api-server:

- `deployment/kubernetes/` — plain manifests (namespace, configmap, secret, deployment,
  service, ingress).
- `deployment/helm/kmos/` — a Helm chart.
- `deployment/olares/` — an Olares application chart.

**Knowledge Studio follows the exact same shape** — same env-driven Postgres wiring, same
self-proving image build — with three substitutions relative to the reference api-server
manifests:

| Reference (api-server) | Knowledge Studio |
|---|---|
| Image CMD `npm run serve` | `npm run studio` |
| Container/Service port `8080` | `8090` |
| Image built from repo-root Dockerfile | Image built from `products/knowledge-studio/Dockerfile` (context = repo root) |

Everything else carries over unchanged:

- **Probes** target `GET /health` (see the Operations Guide).
- **`KMOS_DATABASE_URL`** is injected from a Secret (or, on Olares, composed from the
  injected Postgres middleware values).
- **`KMOS_ENFORCE`** and **`PORT`** come from config.
- **`replicas: 1`** — the reference manifests already pin a single replica because
  in-memory read models are per-pod; Studio keeps this constraint for its per-source job
  state (Operations Guide, Scaling).

> Honesty note: the shipped manifests target the api-server (port 8080, `npm run serve`).
> To deploy Studio, copy that pattern and apply the substitutions above. This guide
> describes the approach; it does not ship a separate set of Studio manifests, and you
> should not assume one exists. Treat the reference manifests as `PREPARED, NOT VALIDATED`
> against your cluster until you have run them there.

---

## 9. Reverse proxy / TLS

Studio serves plain HTTP and does not terminate TLS itself. In production, place it
behind a TLS-terminating reverse proxy or ingress (nginx, Traefik, a cloud load
balancer, or a Kubernetes Ingress). Forward to the Studio port (default 8090) and use
`GET /health` for the upstream health check. There is no path rewriting required — the UI
is served at `/` and the API under `/api/*`.

---

## 10. Verifying a deployment

1. **Liveness/readiness.**
   ```bash
   curl -s http://<host>:8090/health
   # {"status":"ok","sources":0}
   ```
2. **UI loads.** Open `http://<host>:8090/` in a browser. The Studio UI should render.
3. **Process the sample.** In the UI, click **"Try the sample lecture,"** then
   **Process**. The pipeline should complete and produce chapters, concepts, evidence
   quotes, related concepts, lineage, and a trust assessment.
4. **Check a concept.** Open a concept and confirm its evidence quote jumps to the exact
   transcript moment, and that lineage and trust are shown.
5. **(Durable mode) confirm persistence.** With `KMOS_DATABASE_URL` set, restart the
   process and reload the UI: the canonical concepts/relationships/lineage/trust are
   still present (rehydrated from the event log). Note the per-source transcript view is
   rebuilt only on re-processing — see the Operations Guide for the precise persistence
   model before relying on this.

If all five pass, the deployment is functioning. Proceed to the Operations Guide for
ongoing operation.
