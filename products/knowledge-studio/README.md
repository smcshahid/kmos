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

See [`docs/`](docs/): Vision, Architecture, User Guide, Developer Guide, Deployment
Guide, Operations Guide, Extension Guide, API Guide, Roadmap, Release Notes, and the
independent review. Product-thinking foundations live in
[`../lecture-explorer/docs`](../lecture-explorer/docs) (the research and discovery that
led here).

## Honest scope (V1)

The **verifiable-knowledge core runs fully offline** on deterministic reference
capabilities, so you can try everything now. Three capabilities need external infra and
are **architected behind KMOS contracts, reported honestly in the pipeline UI**, and
documented in the Deployment Guide:

- **YouTube download** → a `yt-dlp` capability (offline, you paste the transcript).
- **Speech recognition** → a Whisper/Speaches capability (offline, transcript supplied).
- **Video clips / Reels** → an `ffmpeg` capability (V1 defines the clip model; rendering
  is deferred). The architecture leaves no dead ends for these or future content types.

Status: **V1 — working, tested, reviewed.** See [`docs/ROADMAP.md`](docs/ROADMAP.md).
