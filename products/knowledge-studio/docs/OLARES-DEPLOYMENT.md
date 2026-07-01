# Knowledge Studio — Olares Deployment Runbook

How to install Knowledge Studio on Olares as a first-class app that **shares the KMOS
deployment's PostgreSQL** (one institutional memory; no duplicate services).

> **Honest status.** The chart, manifest, and image are prepared and validated *locally*
> (image builds self-provingly and runs; chart YAML is structurally valid; full-restart
> persistence proven against real PostgreSQL). They have **not** been applied to a live
> Olares cluster from the engineering environment — that step is yours to run, and this
> runbook is written so every claim is verifiable as you go. Nothing here asserts a
> deployment that hasn't happened.

## Architecture on Olares

```
      ┌───────────────┐         ┌──────────────────────┐
      │  KMOS app     │         │  Knowledge Studio app │   (two stateless deployables)
      │  :8080        │         │  :8090                │
      └───────┬───────┘         └───────────┬──────────┘
              │  KMOS_DATABASE_URL           │  KMOS_DATABASE_URL (SAME db)
              └───────────────┬──────────────┘
                    ┌─────────▼─────────┐
                    │ Olares PostgreSQL │  ← shared canonical event log (system of record)
                    └───────────────────┘
```

Both apps are stateless compute; the durable event log in shared PostgreSQL is the single
institutional memory. Read models are per-pod projections rebuilt from the log on boot
(run **one replica** of each — in-memory projections + per-source job cache are per-pod).

## Prerequisites

1. Olares ≥ 1.11 with the **KMOS app installed** (provides the platform + PostgreSQL).
2. A container image for Knowledge Studio, reachable by your cluster (see below).
3. In-cluster connection details for the KMOS PostgreSQL (host, port, db, user, password).

## Step 1 — Build & publish the image

The image is self-proving (runs lint + typecheck + fitness + full tests at build):

```bash
docker build -f products/knowledge-studio/Dockerfile -t <registry>/knowledge-studio:1.0.0 .
docker push <registry>/knowledge-studio:1.0.0
```

Set `image.repository`/`image.tag` in `deployment/olares/values.yaml` accordingly. (A CI
workflow mirroring the KMOS `release-image` job can automate this — see ROADMAP.)

## Step 2 — Choose a database mode

- **Shared mode (recommended).** Point Knowledge Studio at the KMOS database so both apps
  share one event log. Set `databaseUrl` to the in-cluster KMOS Postgres URL:
  ```
  helm ... --set databaseUrl="postgres://<user>:<pass>@<kmos-postgres-host>:5432/<kmos-db>"
  ```
  Processed knowledge is then visible to both apps (one shared institutional memory).
- **Isolated mode.** Leave `databaseUrl` empty; the OlaresManifest `middleware.postgres`
  declaration provisions a separate database (Knowledge Studio gets its own event log,
  **not** shared with KMOS). Simpler, but not shared memory.

## Step 3 — Install

Package the Olares Application Chart (Chart.yaml + OlaresManifest.yaml + templates/) under
`products/knowledge-studio/deployment/olares/` and install via **Olares Studio** (the
recommended pre-submission path) or `helm`/`olares-cli` per your Olares version. Verify the
`middleware.postgres` injected value keys against your Olares release's docs first.

## Step 4 — Verify the deployment (do not assume success)

1. **Health:** `GET https://knowledge-studio.<your-olares-domain>/health` → `{"status":"ok",...}`.
2. **Boot log:** confirm `KMOS backing: PostgreSQL (durable event log + job state)` and, in
   shared mode, that it points at the KMOS database.
3. **Process the sample:** open the UI → *Try the sample lecture* → **Process** → watch the
   pipeline reach *ready*; open a concept and verify its evidence quote jumps to the moment.
4. **Restart persistence (the daily-driver proof):** restart the Knowledge Studio pod, then
   reload — the source, its concepts, evidence, lineage, trust, and favorites must all still
   be there (`recovered sources: N` in the boot log). This is the exact behavior proven
   locally against real PostgreSQL (see OPERATIONAL-VALIDATION.md).
5. **Shared memory (shared mode):** a concept created in Knowledge Studio should be
   retrievable from the KMOS app's `GET /knowledge/:id` after its projection refreshes.
6. **YouTube (optional):** set `KS_CAPTION_ENDPOINT` to a yt-dlp/Whisper/Speaches HTTP
   service on your Olares; a YouTube URL then processes end-to-end. Without it, the acquire
   stage honestly reports *needs infra* and asks for a pasted transcript.

## Step 5 — Backup & restore

The **shared PostgreSQL is the system of record.** Back it up with your normal Postgres
backup (or Olares middleware backup). Restoring it restores knowledge, lineage, trust,
**and** Knowledge Studio's job state (`ks_sources` table) — both apps recover identically
on next boot. See OPERATIONAL-VALIDATION.md for the tested recovery behavior.

## Configuration reference

| Env | Purpose | Default |
|---|---|---|
| `PORT` | HTTP port | `8090` |
| `KMOS_DATABASE_URL` | Shared/durable PostgreSQL (event log + job state) | unset → in-memory |
| `KMOS_ENFORCE` | Attribution enforcement (CRIT-2) | `false` |
| `KS_CAPTION_ENDPOINT` | Provider-independent caption/ASR HTTP capability for YouTube | unset → paste transcript |

## Troubleshooting

- *Health OK but knowledge empty after restart* → confirm `KMOS_DATABASE_URL` is set (else
  in-memory/ephemeral).
- *A source shows no transcript after restart* → it was interrupted mid-processing; it
  recovers as **failed-and-retryable** — click **Retry**.
- *YouTube URL fails immediately* → no caption capability configured; set
  `KS_CAPTION_ENDPOINT` or paste the transcript. This is intended, honest behavior.
- *Knowledge not shared with KMOS* → you're in isolated mode; set `databaseUrl` to the KMOS
  database for shared memory.
