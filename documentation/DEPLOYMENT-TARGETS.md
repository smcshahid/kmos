# KMOS Deployment Targets

_Honest, evidence-tagged guidance for deploying the KMOS api-server across
targets: local (docker-compose), Kubernetes (Helm + raw manifests), Olares
(self-hosted personal cloud), and generic managed cloud._

_Companion documents: `documentation/DEPLOYMENT-GUIDE.md` (build/verify/evaluation
path and the production roadmap) and `documentation/OPERATIONS-GUIDE.md`
(run-time operations, observability, DR, scaling). This document does not
duplicate them; it focuses on **where and how you run the container** per target._

_Last updated: 2026-06-30 · Audience: platform operators, release engineers._

---

## 0. Honesty banner (read first)

> **No target in this document has been deployed or validated in the KMOS
> engineering environment.** The Helm chart (`deployment/helm/kmos/`), the raw
> manifests (`deployment/kubernetes/`), and every Olares / cloud procedure below
> were **authored from the repository sources** and are **PREPARED, NOT
> VALIDATED**. They are a reviewed starting point, not a proven deployment. Steps
> that depend on your own environment (a cluster, an Olares node, a cloud
> account, a managed database) are explicitly marked **[user-environment /
> unverified here]**.

### 0.1 What you are deploying (verified from source)

| Fact | Value | Source |
|---|---|---|
| Shape | Modular monolith — one deployable `api-server` process | `applications/api-server/src/platform.ts`; `OPERATIONS-GUIDE.md` §1 |
| Runtime | Node.js 22+ | `package.json` `engines.node`, `Dockerfile` (`node:22`) |
| Listen port | **8080** (env `PORT`, default 8080) | `applications/api-server/src/index.ts` |
| Health endpoint | **`GET /health`** → `{ status: "ok", ... }` | `applications/api-server/src/server.ts` |
| Metrics endpoint | **`GET /metrics`** → Prometheus text exposition | `applications/api-server/src/server.ts` |
| Reference UI | `GET /` and `GET /ui` | `applications/api-server/src/server.ts` |
| Database | External PostgreSQL via `KMOS_DATABASE_URL` (pgvector/pg16 in CI) | `docker-compose.yml`, `platform/events/src/infrastructure/pg-sql-client.ts` |
| Secrets | Environment variables, prefix `KMOS_SECRET_` (`EnvSecretResolver`) | `platform/configuration/src/infrastructure/env-secret-resolver.ts` |
| Persistence state | EventLog has a real Postgres adapter; other stores are in-memory (projections rebuilt by replay) | `platform/events/src/infrastructure/`, `OPERATIONS-GUIDE.md` §1 |

### 0.2 Secret mapping rule (applies to every target)

KMOS resolves secrets from the environment with the `KMOS_SECRET_` prefix. A
secret reference path is upper-snake-cased under that prefix:

```
reference "db/password"                -> env var KMOS_SECRET_DB_PASSWORD
reference "secret://vault/db/password" -> env var KMOS_SECRET_VAULT_DB_PASSWORD
```

So every target below maps its secret store (K8s Secret, Olares/env file, cloud
secrets manager) to environment variables named `KMOS_SECRET_*`, plus the single
`KMOS_DATABASE_URL` for Postgres.

### 0.3 Replica caveat (applies to every clustered target)

Only the EventLog has a live Postgres adapter today; other projections are
**in-memory and per-process** (rebuilt by replay on start). Running more than one
replica is therefore **not safe for shared state** until live persistence is
wired end-to-end. Every clustered target below defaults to **`replicas: 1`**.
Treat multi-replica scaling as **[unverified here]**.

---

## 1. Local — docker-compose

Use the **existing** compose files; nothing new is introduced here.

### 1.1 Prerequisites
- Docker + Compose.
- npm registry reachable at build time (the image runs `npm run verify` during
  build; see `DEPLOYMENT-GUIDE.md` §4).

### 1.2 Config
- **Root `docker-compose.yml`** (repository root) — brings up Postgres
  (`pgvector/pgvector:pg16`) and the KMOS container with
  `KMOS_DATABASE_URL=postgres://kmos:kmos@postgres:5432/kmos`. The default command
  runs the reference **demo** (`npm run demo`).
- **`deployment/docker/docker-compose.dev.yml`** — Postgres only, for developing
  persistence adapters while running KMOS directly with `npm run …`.

```bash
# Full local stack (Postgres + KMOS demo)
docker compose up
docker compose down          # keep the kmos-pgdata volume
docker compose down -v       # remove the volume

# Local Postgres only
docker compose -f deployment/docker/docker-compose.dev.yml up -d
```

> To run the **HTTP server** locally instead of the demo, override the command to
> `npm run serve` (defined in `package.json`) and publish port 8080. The shipped
> root Dockerfile CMD is the demo, not the server.

### 1.3 Verification
- `docker compose ps` — Postgres reports healthy (`pg_isready`).
- Demo run: the container prints the end-to-end knowledge lifecycle and exits
  with a zero-dead-letters audit (`DEPLOYMENT-GUIDE.md` §2.2).
- If running the server locally: `curl http://localhost:8080/health` returns
  `{"status":"ok",...}`; `curl http://localhost:8080/metrics` returns
  `kmos_events_total …`.
- Repository gates (host, not container): `npm run verify:offline`,
  `npm run health`.

> **Status:** the compose files exist and are documented in `DEPLOYMENT-GUIDE.md`;
> this environment did not execute them as part of preparing these artifacts.

---

## 2. Kubernetes — Helm chart and raw manifests

Two equivalent paths are provided. Use **one**.

- **Helm:** `deployment/helm/kmos/`
- **Raw manifests:** `deployment/kubernetes/`

Both wire: the api-server Deployment (port 8080), a Service, `KMOS_DATABASE_URL`
from a Secret, `KMOS_SECRET_*` env from a Secret, a ConfigMap for non-secret
config, and an optional Ingress. **Postgres is external** — not bundled.

### 2.1 Prerequisites — [user-environment / unverified here]
- A Kubernetes cluster (>= 1.24) and `kubectl` context. **[unverified here]**
- Helm 3 (for the Helm path). **[unverified here]**
- A published KMOS **server** image exposing port 8080. The repository ships a
  build/verify/demo Dockerfile; a server image (CMD `npm run serve`) is expected.
  **[user-environment / unverified here]**
- A reachable managed/self-hosted PostgreSQL, and its DSN for `KMOS_DATABASE_URL`.
  **[user-environment / unverified here]**
- An ingress controller if you enable Ingress. **[unverified here]**

### 2.2 Config — Helm

Key `values.yaml` fields (`deployment/helm/kmos/values.yaml`):

| Value | Purpose |
|---|---|
| `image.repository`, `image.tag` | KMOS server image |
| `command` | Override to `["npm","run","serve"]` if the image CMD defaults to the demo |
| `replicaCount` | Default `1` (see §0.3) |
| `containerPort` | `8080` (verified) |
| `database.url` / `database.existingSecret` | DSN inline (dev) or existing Secret (prod) for `KMOS_DATABASE_URL` |
| `secrets.values` / `secrets.existingSecret` | `KMOS_SECRET_*` map (dev) or existing Secret (prod) |
| `config` | Non-secret env → ConfigMap |
| `livenessProbe` / `readinessProbe` | Target `GET /health` (verified) |
| `ingress.enabled` | Toggle (default `false`) |
| `resources`, `podSecurityContext`, `securityContext` | Requests/limits + hardened defaults |

```bash
# Render locally to review (no cluster needed):
helm template kmos deployment/helm/kmos \
  --set image.repository=YOUR_REGISTRY/kmos --set image.tag=1.0.0-rc.1 \
  --set database.url='postgres://user:pass@host:5432/kmos'

# Install (requires a cluster) — [unverified here]:
helm install kmos deployment/helm/kmos --namespace kmos --create-namespace \
  --set image.repository=YOUR_REGISTRY/kmos --set image.tag=1.0.0-rc.1 \
  --set command='{npm,run,serve}' \
  --set database.existingSecret=kmos-db --set database.existingSecretKey=KMOS_DATABASE_URL
```

For production secrets, prefer `database.existingSecret` / `secrets.existingSecret`
or an external secrets operator (External Secrets, Vault, cloud KMS CSI) that
produces a Secret with `KMOS_SECRET_*` keys — the templates reference Secrets by
name, so any such source works unchanged.

### 2.3 Config — raw manifests

Apply in order (`deployment/kubernetes/`):

```bash
kubectl apply -f deployment/kubernetes/namespace.yaml
kubectl apply -f deployment/kubernetes/configmap.yaml
# Edit secret.yaml (replace REPLACE_ME) or create the Secret imperatively:
kubectl -n kmos create secret generic kmos-secrets \
  --from-literal=KMOS_DATABASE_URL='postgres://user:pass@host:5432/kmos' \
  --from-literal=KMOS_SECRET_DB_PASSWORD='...'
kubectl apply -f deployment/kubernetes/deployment.yaml
kubectl apply -f deployment/kubernetes/service.yaml
# Optional — only if you run an ingress controller:
kubectl apply -f deployment/kubernetes/ingress.yaml
```

### 2.4 Verification — [unverified here]
- `kubectl -n kmos get pods` — pod `Ready` (readiness probe on `/health` passing).
- `kubectl -n kmos port-forward svc/kmos 8080:80` then:
  - `curl http://localhost:8080/health` → `{"status":"ok",...}`
  - `curl http://localhost:8080/metrics` → `kmos_events_total …`
- Conformance / platform gates (run against the repo or a copy of the image):
  `npm run verify:offline`, `npm run health`, and the conformance suite per
  `documentation/CONFORMANCE.md`.

> **Status:** neither the Helm chart nor the raw manifests were applied to a
> cluster in this environment. `helm template` renders offline for review, but no
> `helm install` / `kubectl apply` was executed here.

---

## 3. Olares (self-hosted personal cloud) — [prepared, not validated]

[Olares](https://olares.com) is a self-hosted personal-cloud OS. KMOS ships **no
Olares-specific manifest** and none is invented here; the guidance below reuses
the container / compose and env-based secret model. **Every step in this section
is user-environment-specific and was NOT validated in the KMOS engineering
environment.**

### 3.1 Prerequisites — [user-environment / unverified here]
- A running Olares node/cluster you administer. **[unverified here]**
- A container image for KMOS available to your Olares node (the server image, or
  the repository image running `npm run serve`). **[user-environment]**
- PostgreSQL: either an **Olares Postgres addon/app** or an external managed
  Postgres reachable from the Olares node. **[user-environment / unverified here]**

### 3.2 Config — approach
Because Olares runs OCI containers, deploy KMOS with the **same three inputs** as
every other target:

1. **Container** — the KMOS server image, listening on **8080**, with the command
   set to `npm run serve` (not the demo).
2. **Database** — provision Postgres:
   - Preferred: install a **Postgres addon/app** in Olares, create a `kmos`
     database and user, and take note of its in-cluster DSN.
     **[user-environment — exact addon name/UI steps depend on your Olares
     version; unverified here]**
   - Or point at an external managed Postgres.
   - Set `KMOS_DATABASE_URL=postgres://<user>:<password>@<host>:5432/kmos`.
3. **Secrets + env** — provide `KMOS_DATABASE_URL` and any `KMOS_SECRET_*` values
   through Olares' environment/secret mechanism for the app (env vars, mounted
   secret, or `--env-file` if you run compose directly on the node). Use the
   mapping in §0.2.

If you run **docker-compose directly on the Olares node**, you can adapt the
existing root `docker-compose.yml`: change the `kmos` service `command` to
`["npm","run","serve"]`, publish port `8080`, and keep the `postgres` service (or
replace it with the Olares Postgres addon and remove the bundled one). This reuses
the verified wiring; the Olares placement around it is **[unverified here]**.

### 3.3 Verification — [unverified here]
- From the Olares node or an allowed client, reach the app on port 8080:
  - `curl http://<olares-app-host>:8080/health` → `{"status":"ok",...}`
  - `curl http://<olares-app-host>:8080/metrics` → `kmos_events_total …`
- Confirm the container reads `KMOS_DATABASE_URL` (Postgres reachable) and the
  expected `KMOS_SECRET_*` variables are present in the container environment.
- Run `npm run health` / `npm run verify:offline` against a checkout or the image
  to confirm platform integrity.

> **Status:** no Olares deployment was performed or validated here. Addon names,
> networking, ingress/domain, and secret UI are Olares-version- and
> node-specific — treat this whole section as a prepared recipe to adapt.

---

## 4. Generic managed cloud — [prepared, not validated]

Any container platform (managed Kubernetes, Cloud Run / App Runner / Container
Apps, ECS, Nomad, a plain VM with Docker) plus a managed Postgres and a secrets
manager. The mapping is uniform because KMOS is env-configured.

### 4.1 Prerequisites — [user-environment / unverified here]
- A container platform account and the KMOS server image in a registry it can pull.
- A **managed PostgreSQL** (RDS/Cloud SQL/Azure Database/etc.), reachable from the
  container, with a DSN for `KMOS_DATABASE_URL`.
- A **secrets manager** (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault,
  HashiCorp Vault) or the platform's native secret store.

### 4.2 Config — mapping
| KMOS input | Cloud mapping |
|---|---|
| `KMOS_DATABASE_URL` | Store the managed-Postgres DSN as a secret; inject as the `KMOS_DATABASE_URL` env var. |
| `KMOS_SECRET_*` | For each secret reference, create a secrets-manager entry and inject it as the correspondingly-named `KMOS_SECRET_*` env var (see §0.2). |
| `PORT` | Set to `8080` (or map the platform's required port to the container's 8080). |
| Health check | Point the platform's health check at **`GET /health`** on port 8080. |
| Metrics | Scrape **`GET /metrics`** (Prometheus text) if you run Prometheus/agent. |
| Command | Ensure the container runs the server (`npm run serve`), not the demo. |
| Replicas | Keep `1` until live persistence is validated (§0.3). |

### 4.3 Verification — [unverified here]
- Platform health check on `/health` reports healthy; container stays running.
- `curl https://<your-endpoint>/health` and `/metrics` return the expected JSON /
  Prometheus output.
- Managed Postgres shows the KMOS connection; secrets manager entries resolve into
  `KMOS_SECRET_*` env vars inside the container.
- Platform-integrity gates: `npm run verify:offline`, `npm run health`, and the
  conformance suite (`documentation/CONFORMANCE.md`).

> **Status:** no cloud provider deployment was performed or validated here. All
> provider-specific steps are prepared mappings to adapt to your account.

---

## 5. Cross-target verification checklist

Regardless of target, a healthy KMOS api-server should satisfy:

- [ ] `GET /health` returns HTTP 200 `{"status":"ok", "events": <n>, "deadLetters": 0}`.
- [ ] `GET /metrics` returns Prometheus text starting with `# KMOS platform metrics`.
- [ ] `KMOS_DATABASE_URL` is set and points at a reachable Postgres.
- [ ] Required `KMOS_SECRET_*` variables are present (never inlined into config/logs).
- [ ] `npm run verify:offline` passes against the code/image (fitness + tests).
- [ ] Conformance suite passes per `documentation/CONFORMANCE.md`.
- [ ] Replica count is `1` unless shared persistence has been validated.

**None of the above was executed against a deployed target in this engineering
environment.** These artifacts are prepared for your review and adaptation.

---

## 6. References

- Verified sources: `applications/api-server/src/index.ts` (port 8080, `serve`),
  `applications/api-server/src/server.ts` (`/health`, `/metrics`, UI),
  `applications/api-server/src/platform.ts` (composition),
  `platform/configuration/src/infrastructure/env-secret-resolver.ts`
  (`KMOS_SECRET_` mapping),
  `platform/events/src/infrastructure/pg-sql-client.ts` (`KMOS_DATABASE_URL`).
- Artifacts: `deployment/helm/kmos/`, `deployment/kubernetes/`,
  `docker-compose.yml`, `deployment/docker/docker-compose.dev.yml`.
- Companion docs: `documentation/DEPLOYMENT-GUIDE.md`,
  `documentation/OPERATIONS-GUIDE.md`, `documentation/CONFORMANCE.md`.
