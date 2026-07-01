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

## The flow (identical to how you installed KMOS)

You do **not** build anything locally. It is the same three steps you used for KMOS:

1. **GitHub Actions builds + pushes the image** to Docker Hub.
2. **You download the packaged OAC `.tgz`.**
3. **You upload the `.tgz`** on Olares via **Market → My Olares → Upload custom chart** —
   Olares provisions PostgreSQL from the manifest and boots the app.

> `docker build` is **only** a local self-check for engineers; it is **not** your install
> path. Ignore it for deployment.

## Prerequisites

1. Olares ≥ 1.11 (the same node where KMOS runs).
2. Repository secrets `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` already set (you added these
   for the KMOS image — the Knowledge Studio workflow reuses them).

## Step 1 — Build & publish the image (GitHub Actions, one click)

Actions → **Release Knowledge Studio image** → **Run workflow** → tag `1.1.0`. The workflow
(`.github/workflows/release-studio-image.yml`) builds `products/knowledge-studio/Dockerfile`
(self-proving — it runs the full `npm run verify` at build) and pushes:

```
docker.io/<your-dockerhub-username>/knowledge-studio:1.1.0
docker.io/<your-dockerhub-username>/knowledge-studio:latest
```

(Or push a `studio-v1.1.0` git tag to trigger the same build.) Confirm the image appears in
your Docker Hub. `values.yaml` already points at `malikshahid85/knowledge-studio:1.1.0` —
adjust the namespace if yours differs.

## Step 2 — Get the OAC `.tgz`

A ready package is committed at
[`deployment/package/knowledge-studio-1.1.0.tgz`](../deployment/package/knowledge-studio-1.1.0.tgz)
— download it from the repo. To regenerate it after any chart change:

```bash
bash scripts/package-studio-oac.sh   # → products/knowledge-studio/deployment/package/knowledge-studio-<version>.tgz
```

The tarball is a standard Olares Application Chart (top-level `knowledge-studio/` with
`Chart.yaml`, `OlaresManifest.yaml`, `values.yaml`, `templates/`).

## Step 3 — Install on Olares (upload the custom chart)

**Market → My Olares → Upload custom chart** → upload `knowledge-studio-1.1.0.tgz` → install
(exactly as you did for KMOS). On install Olares reads `OlaresManifest.yaml`, **provisions a
PostgreSQL database** (the `middleware.postgres` declaration — user/db `studio`, `vectors`
extension), injects the connection, and the app boots with a **durable event log + job
state**. Reach it at the declared entrance (`knowledge-studio`, port `8090`, `authLevel:
private`) — your host will look like `https://<id>.<your-olares-domain>`.

> This is **isolated mode**: Knowledge Studio gets its own Olares-managed PostgreSQL — the
> same shared-infrastructure pattern KMOS uses (Olares owns the Postgres process; the app
> owns what's in it), and its knowledge is fully durable across restarts. It does **not**
> literally share the KMOS app's database. If you want **one shared institutional memory**
> across both apps, use *shared mode* (Advanced, below) — but isolated mode is the
> recommended daily-driver install and needs nothing beyond the upload.

## Frictionless YouTube (paste a URL → explore)

By default YouTube needs a pasted transcript. To make a raw **YouTube URL** process end to
end, enable the **caption/ASR sidecar** — a tiny yt-dlp + Whisper/Speaches companion that
runs in the **same pod**, so Knowledge Studio reaches it at `localhost` (no cross-app
networking). It uses your existing Olares **Speaches/Whisper** for audio it can't caption.

**Step A — publish the caption image** (once): Actions → **Release caption service image**
→ Run workflow → tag `1.0.0`. Pushes `docker.io/<your-ns>/knowledge-studio-caption:1.0.0`.

**Step B — enable it at install** by setting these chart values before packaging (or via
your Olares chart-values UI), then re-run `bash scripts/package-studio-oac.sh` and upload
the new `.tgz`:

```yaml
captionService:
  enabled: true
  image: { repository: <your-ns>/knowledge-studio-caption, tag: "1.0.0" }
  speachesUrl: "http://<your-speaches-host>:8000"   # your Olares Whisper/Speaches
  asrModel: "Systran/faster-whisper-small"
```

Knowledge Studio then auto-sets `KS_CAPTION_ENDPOINT=http://localhost:8092`. Verify:
the app boot log shows a caption endpoint; the caption sidecar's `/health` returns
`{"status":"ok","asr":"configured"}`; pasting a YouTube URL now reaches *ready* with a real
transcript. Captions-only (no Speaches) still works for videos that have captions — leave
`speachesUrl` empty. Provider-independent: point `speachesUrl` at any OpenAI-audio-compatible
ASR server. See [`../services/caption-service/README.md`](../services/caption-service/README.md).

## Richer concepts (Ollama)

The offline reference extractor is basic. Point Knowledge Studio at your Olares **Ollama**
for LLM-backed concepts + real definitions — provider-independent, behind the KMOS
capability contract, with automatic fallback to the reference extractor on any failure (so
processing never breaks). Set at install:

```yaml
ollama:
  url: "http://<your-ollama-host>:11434"   # empty → reference extractor
  model: "llama3.1"
```

Verify: the app boot log shows `concept extraction: Ollama @ …`; process the sample and the
concepts/definitions are noticeably richer. See [ADR-KS-0002](adr/ADR-KS-0002-language-domain-capability-injection.md).

### Advanced — shared-database mode (one memory with KMOS)

Set `databaseUrl` (in `values.yaml` before packaging, or via your Olares chart values) to
the in-cluster KMOS PostgreSQL URL so both apps read/write one event log:
`postgres://<user>:<pass>@<kmos-postgres-host>:5432/<kmos-db>`. This is optional and
requires knowing KMOS's in-cluster DB connection; skip it unless you specifically want
cross-app shared knowledge.

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
