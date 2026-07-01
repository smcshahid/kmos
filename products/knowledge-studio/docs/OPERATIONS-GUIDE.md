# Knowledge Studio — Operations Guide

Audience: operators running Knowledge Studio (KMOS ecosystem flagship #001) in a
deployed environment.

This guide covers day-2 operations: health checks, the precise persistence model,
backup/restore, scaling, upgrades/rollbacks, observability, common issues, and a runbook.
For how to deploy in the first place, see [`DEPLOYMENT-GUIDE.md`](DEPLOYMENT-GUIDE.md).

The guiding principle: **be honest about what is durable and what is not.** Knowledge
Studio makes strong, verifiable durability guarantees for KMOS canonical facts — and one
clearly-bounded exception for per-source job state. This guide states both plainly.

---

## 1. Health checks & probes

Studio exposes a single health endpoint:

```
GET /health  →  200  {"status":"ok","sources":N}
```

- `status` is `"ok"` when the process is up and serving.
- `sources` is the number of sources currently tracked in the process.

Use `/health` for **both liveness and readiness** probes. There is no separate readiness
path; the process is ready to serve as soon as it is listening (in durable mode, that is
after read-model rehydration and search rebuild complete on boot).

Reference probe settings (from the KMOS reference manifests, targeting `GET /health`):

```yaml
livenessProbe:
  httpGet: { path: /health, port: http }
  initialDelaySeconds: 10
  periodSeconds: 15
  timeoutSeconds: 3
  failureThreshold: 3
readinessProbe:
  httpGet: { path: /health, port: http }
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3
```

For a durable deployment with a large event log, allow more headroom on
`initialDelaySeconds` if boot rehydration takes longer.

---

## 2. What's durable vs ephemeral (the persistence model)

This is the most important section. Read it before making any durability claim about
Knowledge Studio.

### Durable across restarts (when `KMOS_DATABASE_URL` is set)

The **KMOS canonical event log** in PostgreSQL is the system of record. On boot Studio
runs the events-table DDL idempotently and rehydrates from the durable log. The following
survive restarts and are served **identically** afterward:

- **Knowledge** — concepts and relationships.
- **Assets** — sources, transcripts as assets, derivation, integrity.
- **Governance** — trust assessments (explainable trust).
- **Identity** — actors / attribution.
- **Capability registry.**
- **Search index** — rebuilt on boot from the rehydrated read models.

So after a restart, a source's **canonical concepts, relationships, lineage, and trust
persist.**

### Ephemeral (in-memory, per-process; NOT rehydrated on restart)

The application's **per-source job state** is currently held **in memory in the Studio
process** and is **not** rehydrated on restart:

- pipeline status (the per-source processing stages),
- the parsed transcript segments used for the **evidence-quote projection**,
- chapter layout.

Consequence, stated plainly: after a restart, the canonical concepts/relationships/
lineage/trust are all still there — but a source's **live transcript/segment view (and
therefore its evidence-quote jump-to-moment projection) is rebuilt only when the source
is re-processed.** The knowledge is durable; the transcript-derived view of that one
source is a per-process projection.

> **Do not overstate durability.** "Everything survives a restart" is false. The correct
> statement is: *KMOS canonical facts survive; per-source transcript/segment job state is
> rebuilt on re-processing.*

**Roadmap.** Persisting/rehydrating per-source job state (so the transcript view and
evidence-quote projection are restored without re-processing) is a known operational
characteristic and a roadmap item, not a shipped guarantee. Track it in
[`ROADMAP.md`](ROADMAP.md).

### In-memory mode (no `KMOS_DATABASE_URL`)

Everything is ephemeral — the whole knowledge base is lost on restart. This mode is for
demo/dev only. Never rely on it for anything you need to keep.

---

## 3. Backup & restore

The **PostgreSQL event log is the system of record.** Backing it up backs up all
knowledge, lineage, and trust; restoring it restores them.

**Backup**

- Prefer the managed provider's automated backups + point-in-time recovery.
- Or take logical dumps on a schedule:
  ```bash
  pg_dump "$KMOS_DATABASE_URL" -Fc -f kmos-eventlog-$(date +%F).dump
  ```
- The event log is append-only, so backups are consistent and incremental-friendly.

**Restore**

1. Provision/point at a target database and set `KMOS_DATABASE_URL` to it.
2. Restore the dump:
   ```bash
   pg_restore -d "$KMOS_DATABASE_URL" --clean --if-exists kmos-eventlog-YYYY-MM-DD.dump
   ```
3. Start Studio. On boot it rehydrates every read model from the restored log and
   rebuilds the search index — knowledge, lineage, and trust return automatically.

**What restore does not bring back:** per-source transcript/segment job state (see §2).
After restore, re-process a source if you need its live transcript view and evidence-quote
projection. The canonical concepts/relationships/lineage/trust are already restored.

Test your restore procedure periodically against a scratch database — an untested backup
is not a backup.

---

## 4. Scaling

**Run a single replica.** Studio's per-source job state is held in-process (§2), so
requests for a given source must be served by the process that holds its job state.
Horizontal scaling would fragment that state across replicas.

The reference KMOS manifests already pin `replicas: 1` for the same underlying reason
(in-memory read models are per-pod). Keep that constraint for Studio.

Scale **vertically** if needed — give the single replica more CPU/memory. The Postgres
event log can be scaled/managed independently on the database side. Multi-replica
horizontal scaling is gated on the roadmap work to persist and share per-source job
state (§2); do not enable it before that lands.

---

## 5. Upgrades & rollbacks

Because the **event log is the source of truth** and read models rehydrate from it,
upgrades are low-risk when the event schema is unchanged:

**Upgrade**

1. Build the new Studio image (the build runs the full verification gates — a failed
   verify fails the build, so a built image is self-proving).
2. Point the new image at the **same** `KMOS_DATABASE_URL`.
3. Roll: stop the old process/pod, start the new one. On boot it rehydrates from the
   existing log and rebuilds search. Expect a brief unavailability window (single
   replica) covering rehydration time.

**Rollback**

- Redeploy the previous image against the same database. Rehydration restores the read
  models from the durable log. The append-only log means an older compatible build reads
  the same history.
- Only worry about event-schema compatibility across versions; the DDL is applied
  idempotently, and canonical events are versioned and immutable.

After any upgrade or rollback, run the deployment verification steps (Deployment Guide
§10): `/health`, process the sample, check a concept.

---

## 6. Observability

- **Operational memory = the event log.** KMOS emits a durable, replayable event log.
  This is your primary source of truth for what happened and when — every canonical fact
  is an event you can replay. Treat it as the audit/history substrate, not just storage.
- **Health.** Scrape `GET /health` for liveness/readiness and for the current `sources`
  count.
- **Logs.** Studio logs to stdout/stderr (listening address, event-log backing, and
  processing/errors). Collect them with your standard container/log pipeline. Startup
  logs whether the event log is `PostgreSQL (durable event log)` or `in-memory` — check
  this after every deploy to confirm you are in the mode you intend.
- **Process supervision.** Use standard Node process supervision and a container
  **restart policy** (e.g. `restart: always` / Kubernetes default). Combined with the
  durable event log, an automatic restart returns to a consistent knowledge base.
- **Database.** Monitor the managed Postgres (connections, storage growth, backup
  success) with the provider's tooling.

---

## 7. Common issues & remedies

| Symptom | Cause | Remedy |
|---|---|---|
| **Concepts/lineage/trust persist after a restart, but a source shows no transcript / evidence quotes won't jump to a moment.** | Expected: per-source transcript/segment job state is in-memory and not rehydrated (§2). | **Re-process the source.** The canonical knowledge was never lost; re-processing rebuilds the transcript view and evidence-quote projection. |
| **Everything is gone after a restart.** | Running in-memory (no `KMOS_DATABASE_URL`). | Set `KMOS_DATABASE_URL` to a durable Postgres and redeploy. Confirm the startup log says `PostgreSQL (durable event log)`. |
| **Empty transcript submitted.** | No content to process. | The source **fails with a clear message.** Supply a non-empty transcript and re-submit. |
| **YouTube URL pasted with no transcript available.** | YouTube download / speech-to-text are deferred capabilities in V1 (§8). | It **fails honestly** in the pipeline UI — this path needs external infra (yt-dlp / Whisper). For now, paste the transcript instead. |
| **`/health` returns but UI shows no data after deploy.** | Fresh database, or wrong `KMOS_DATABASE_URL`. | Verify the URL points at the intended database; check startup logs; restore from backup if this is a recovery. |
| **Boot is slow / readiness flaps on a large database.** | Rehydration + search rebuild on boot. | Increase probe `initialDelaySeconds`; give the replica more memory. |

---

## 8. Deferred external-infra capabilities (honest scope)

Three capabilities are **architected behind KMOS capability contracts** but **deferred in
V1**. The offline verifiable-knowledge core needs none of them — users paste transcripts.

| Capability | External infra | V1 status |
|---|---|---|
| YouTube download | `yt-dlp` | Deferred — paste the transcript. |
| Speech-to-text | Whisper / Speaches | Deferred — supply the transcript. |
| Video-clip / Reel rendering | `ffmpeg` | Deferred — V1 defines the clip model; rendering is not implemented. |

When you later connect these, each becomes an **additional capability service** with its
own resource, scaling, and operational considerations (CPU/GPU for transcription, disk
and bandwidth for downloads/rendering). They do not change Studio's core deployment; they
attach behind the existing capability contracts. Until then, expect the honest failures
described in §7 for those paths.

---

## 9. Runbook (quick reference)

**Is it up?**
```bash
curl -s http://<host>:8090/health   # expect {"status":"ok","sources":N}
```

**Which persistence mode am I in?**
Check the startup log line `KMOS event log: <PostgreSQL (durable event log) | in-memory>`.

**A source lost its transcript view after restart.**
Expected in-memory job-state behavior (§2). Re-process the source. Canonical knowledge is
intact.

**Recover after data loss / DB rebuild.**
1. Restore the Postgres event-log backup (§3).
2. Point `KMOS_DATABASE_URL` at it; start Studio.
3. Read models rehydrate and search rebuilds automatically on boot.
4. Re-process sources whose live transcript views you need.
5. Verify: `/health`, process the sample, check a concept (Deployment Guide §10).

**Deploy a new version.**
Build the image (verify gates run at build), point it at the same database, roll the
single replica, verify (§5).

**Something needs external infra (YouTube/STT/clips).**
Deferred in V1 (§8). Expect an honest pipeline failure; paste transcripts for now.

**Golden rule.** The Postgres event log is the system of record. Protect it, back it up,
test the restore. If it is safe, your knowledge, lineage, and trust are safe.
