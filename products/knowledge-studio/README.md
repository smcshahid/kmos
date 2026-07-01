# Knowledge Studio

**Flagship application #001 of the KMOS ecosystem.**

> **Drop long-form knowledge in. Leave with understanding.**

Paste a YouTube link or a transcript, press **Process**, and watch a lecture become a
navigable map of ideas — every concept grounded in the exact moment it was said, with
**lineage** and **explainable trust**. It's useful the moment you open it, and you never
need to know KMOS exists. But under the calm surface, every result is a verifiable KMOS
fact — which is exactly why it's the front door to the platform.

## Why it's different

Every competitor makes you either **do the work** (Obsidian/Logseq: build the graph by
hand) or **trust the machine** (NotebookLM: ephemeral AI artifacts, citations that RAG
still fabricates). Knowledge Studio does the work *for* you **and proves every result** —
because in KMOS, **evidence, lineage, and trust are structural facts, not app features or
model output.**

- **Verifiable, not asserted.** Every concept answers *Where did this come from? Why
  should I trust it? Show me the proof.* — one click to the exact transcript moment.
- **Durable & owned.** Concepts are canonical KMOS objects that survive restarts, not a
  session you close and lose.
- **Provider-independent AI.** Transcription, extraction, and translation are KMOS
  capabilities behind contracts — swap Ollama, Whisper, or a hosted model freely.

## What you get from one source

Transcript (searchable, timecoded) · auto **chapters** · first-class **concepts** ·
**evidence quotes** with jump-to-moment · focused **related concepts** · **lineage** ·
**explainable trust** · semantic **search** · **collections** · a **Download Center**
(transcript, study notes, concepts JSON, full knowledge package — all cited).

## Run it (30 seconds)

```bash
# from the repo root
npm install
npm run studio            # → http://localhost:8090  (UI at /, health at /health)
```

Open the UI, click **“Try the sample lecture,”** press **Process**, and explore. For a
durable, restart-safe knowledge base, set `KMOS_DATABASE_URL` to a PostgreSQL instance
(the canonical event log is then persistent and the read model rehydrates on boot).

```bash
docker build -f products/knowledge-studio/Dockerfile -t knowledge-studio .
docker run -p 8090:8090 knowledge-studio
```

## How it works (thin over KMOS)

Knowledge Studio adds **orchestration + UX only** — no business logic, nothing bypassed
(KMOS-9999 §9; kernel frozen, ADR-0012). It drives KMOS end to end:

| Product step | KMOS |
|---|---|
| Source + transcript, with lineage | **Assets** (registration, derivation, integrity) |
| Concepts + translation | **Language domain** → **Knowledge** (via **Workflow** + **Capabilities**) |
| Evidence quote (jump-to-moment) | Projection over the transcript **Asset** (the concept's evidence ref) |
| Related concepts | **Knowledge** relationships |
| Trust (explained) | **Governance** trust assessment |
| Search | **Search & Discovery** |
| History / durability | **Events** (durable, replayable) |
| Attribution | **Identity** |

## Documentation

See [`docs/`](docs/): [Vision](docs/VISION.md), [Architecture](docs/ARCHITECTURE.md),
[User Guide](docs/USER-GUIDE.md), [Developer Guide](docs/DEVELOPER-GUIDE.md),
[API Guide](docs/API-GUIDE.md), [Deployment](docs/DEPLOYMENT-GUIDE.md) &
[Operations](docs/OPERATIONS-GUIDE.md) guides, [Extension Guide](docs/EXTENSION-GUIDE.md),
[Roadmap](docs/ROADMAP.md), [Release Notes](docs/RELEASE-NOTES.md), and the
[product review](docs/INDEPENDENT-REVIEW.md).

**Operations (v1.1):** [Olares Deployment runbook](docs/OLARES-DEPLOYMENT.md) ·
[Operational Validation report](docs/OPERATIONAL-VALIDATION.md) ·
[Daily-Driver Assessment & independent review](docs/DAILY-DRIVER-ASSESSMENT.md).

Product-thinking foundations live in [`../lecture-explorer/docs`](../lecture-explorer/docs)
(the research and discovery that led here). Deployment assets:
[`deployment/olares/`](deployment/olares).

## Honest scope

The **verifiable-knowledge core runs fully offline** on deterministic reference
capabilities, so you can try everything now. With `KMOS_DATABASE_URL` set, the full
experience is **durable across restarts** (proven against real PostgreSQL). Remaining
external-infra capabilities are **architected behind KMOS contracts, reported honestly in
the pipeline UI**:

- **YouTube captions / speech recognition** → a provider-independent HTTP capability
  (`KS_CAPTION_ENDPOINT`, e.g. yt-dlp + Whisper/Speaches). Set it and YouTube processes
  end-to-end; absent, you paste the transcript and the pipeline says so.
- **Richer concept extraction** → connect an Ollama/hosted-LLM capability (same contract)
  for better concepts than the offline reference extractor.
- **Video clips / Reels** → an `ffmpeg` capability (clip model defined; rendering deferred).

The live install on your Olares is a documented, verifiable handoff — see the
[Olares Deployment runbook](docs/OLARES-DEPLOYMENT.md); nothing here claims a deployment
that hasn't been run on your cluster.

Status: **v1.1 — daily-driver: durable, deployable, reliable; tested and reviewed.** See
[`docs/ROADMAP.md`](docs/ROADMAP.md).
