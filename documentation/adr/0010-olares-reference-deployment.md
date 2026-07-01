# ADR 0010 — Olares Application Chart as the reference self-hosted deployment

## Status

**Accepted (validated on real Olares).** KMOS `1.0.0-pc.1` was installed and
operated on a real Olares instance (`mwayolares`): the Olares Application Chart
was accepted, Olares provisioned PostgreSQL via the manifest's `middleware.postgres`
declaration, the full workflow ran end-to-end, and the **durable event log survived
an app restart** (77→79 events). Evidence + independent review:
[`engineering/review/18`](../../engineering/review/18-OLARES-DEPLOYMENT-VALIDATION-REPORT.md).
Complements ADR-0009 (async EventLog) and ADR-0003 (ports and adapters).

## Context

KMOS needed a first, real, reproducible self-hosted deployment target. Olares was
chosen as the proving ground. The pre-existing deployment artifacts (Dockerfile,
Helm chart, K8s manifests) were *prepared* but unvalidated; the server also did not
actually honour `KMOS_DATABASE_URL` (it ran in-memory regardless).

## Decision

1. **The Olares Application Chart** (`deployment/olares/`: a Helm chart +
   `OlaresManifest.yaml`) is the **reference self-hosted deployment** for KMOS.
   KMOS **owns** its constitutional core (event log, engines, domains, its own
   Identity Service) and **consumes infrastructure** from Olares — specifically the
   managed **PostgreSQL** middleware for the durable event log (the `vectors`
   extension). MinIO/Redis/Ollama/ComfyUI/Speaches and the Olares-identity bridge
   are roadmap consumption, wired as adapters/capabilities, never as kernel changes.
2. **The image is published** to a public registry (`docker.io/malikshahid85/kmos`)
   by `.github/workflows/release-image.yml`; the chart pulls it (no build-on-host).
3. **`createPlatformFromEnv`** wires a real `PostgresEventLog` when
   `KMOS_DATABASE_URL` is present (durable system of record), else in-memory.
4. **`replicas: 1` is mandatory** until read-model persistence lands (in-memory
   projections are per-pod). The same artifact ports to Kubernetes/cloud by changing
   only the adapter (managed Postgres, secret store, ingress) — never the kernel.

## Consequences

- KMOS has a **validated, durable, single-node self-hosted deployment** on the real
  target platform — the largest prior operational gap (in-memory only) is closed
  with evidence.
- The deployment model is **portable** (Olares → K8s → cloud) because infrastructure
  is consumed through ports.
- **The final pre-GA engineering blocker is now precisely identified:** repository-
  backed **read-model recovery on boot** (object detail is not rebuilt from the log
  on restart). Closing it removes the `replicas: 1` constraint and makes restarts
  fully transparent. See review/18 §5–§6.

## Alternatives considered

- **Bundle PostgreSQL in the chart.** Rejected: Olares provides managed Postgres;
  bundling duplicates infrastructure and breaks the own-vs-consume boundary.
- **Build the image on the Olares host.** Rejected: Olares runs pre-built images;
  a self-verifying published image is the correct, portable artifact.
- **Declare GA on successful deployment.** Rejected: durable deployment is necessary
  but not sufficient; read-model recovery + LICENSE + a backup drill remain (review/18).

## References

- Evidence: `engineering/review/18-OLARES-DEPLOYMENT-VALIDATION-REPORT.md`;
  `documentation/OLARES-DEPLOYMENT-GUIDE.md`; `deployment/olares/`.
- ADR-0009 (async EventLog / CRIT-1); ADR-0003 (ports & adapters).
