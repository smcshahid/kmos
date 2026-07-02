# CrawlStation — Deployment Guide

CrawlStation is a stateless compute deployable. It runs fully in-memory by default and
becomes durable + restart-safe when pointed at PostgreSQL. It is a **companion** to the
KMOS deployment: the recommended topology shares the KMOS PostgreSQL event log so the
whole ecosystem holds **one** institutional memory.

> The crawler makes **outbound HTTP(S) requests** to the sites you acquire. Whatever you
> deploy on, give the container network egress to those sites. robots.txt is honored by
> default.

## 1. Local / Docker

```bash
# In-memory (ephemeral) — great for a first look:
docker build -f products/crawl-station/Dockerfile -t crawl-station .
docker run -p 8092:8092 crawl-station

# Durable, sharing an existing KMOS PostgreSQL:
docker run -p 8092:8092 \
  -e KMOS_DATABASE_URL=postgres://kmos:kmos@host.docker.internal:5432/kmos \
  crawl-station
```

The image builds the monorepo and runs the full verification gate (`npm run verify`) at
build time, so it is self-proving. Health check: `GET /health` → `{ "status": "ok" }`.

## 2. Olares (Application Chart)

The chart lives at `products/crawl-station/deployment/olares/`
(`OlaresManifest.yaml`, `Chart.yaml`, `values.yaml`, `templates/`). The ecosystem
`release.yml` packages it into the GitHub Release as `crawl-station-<version>.tgz`
alongside the KMOS, Knowledge Studio, and Podcast Studio charts + `SHA256SUMS.txt`.

> **Prepared, not validated:** authored from the OlaresManifest spec; verify field
> names/values against your Olares version and test via Olares Studio before submission
> (same status as the other product charts).

Two modes, set at install:

- **Shared (recommended)** — set `databaseUrl` to the KMOS app's PostgreSQL. CrawlStation
  writes to the **same** canonical event log as KMOS; acquired knowledge is visible across
  the ecosystem. Install the KMOS app first.
- **Isolated** — leave `databaseUrl` empty; the Olares-injected middleware PostgreSQL
  (declared in the manifest) backs a standalone instance.

Install: Olares Studio → Market → *Install a custom app* → upload `crawl-station-<v>.tgz`.
The app listens on **8092** (`entrances` → private).

Resources (per pod): requests 250m CPU / 256Mi; limits 1 CPU / 1Gi. Keep **replicas: 1** —
read models and the per-crawl cache are in-memory per pod.

## 3. Kubernetes / Helm

The Olares chart is a standard Helm chart and installs on vanilla Kubernetes:

```bash
helm install crawl-station products/crawl-station/deployment/olares \
  --set image.repository=<your-registry>/crawl-station --set image.tag=<version> \
  --set databaseUrl=postgres://kmos:kmos@postgres:5432/kmos
```

A `Deployment` (1 replica) + `Service` (ClusterIP :8092) with liveness/readiness probes on
`/health`. Front it with your own Ingress/TLS.

## Configuration reference

| Value / env | Default | Notes |
|---|---|---|
| `PORT` | `8092` | UI + API port. |
| `KMOS_DATABASE_URL` / `.Values.databaseUrl` | *(empty)* | Durable event log + crawl state when set; else in-memory. |
| `KMOS_ENFORCE` / `.Values.enforce` | `false` | Require an actor on every canonical write. |
| `CS_USER_AGENT` / `.Values.userAgent` | identifies CrawlStation | Sent to sites + robots.txt. |

## Upgrades & data

Acquired knowledge is durable in the shared event log; crawl job-state is a JSONB table
(`cs_crawls`) in the same database. Standard `pg_dump`/restore covers both. Because read
models rebuild from the event log on boot (ADR-0011), a rolling image upgrade preserves the
full experience. Back up the KMOS PostgreSQL as you would for KMOS itself.
