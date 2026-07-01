# Knowledge Studio — Release Notes

## v1.0.0 — Verifiable knowledge from long-form media

The first flagship application of the KMOS ecosystem. **Drop long-form knowledge in. Leave
with understanding.**

### Highlights

- **Drop-and-understand flow.** Paste a YouTube URL or a transcript (or name an upload),
  press **Process**, and watch a **visible pipeline** turn media into an explorable,
  verifiable map of ideas — nothing magical, every step named.
- **Verifiable by construction.** Every concept carries its **evidence** — the exact
  transcript quote and moment, one click away — plus **lineage** (chain of custody) and
  **explainable trust** (reasons, never a bare score). Grounded concepts read *Trusted*;
  ungrounded ones honestly read *Needs review* — the app never fabricates a quote.
- **One source, many products.** Searchable timecoded transcript, translation, auto
  chapters, first-class concepts, related-concept navigation, semantic search, collections,
  and a **Download Center** (transcript `.txt`/`.md`, study notes, concepts JSON, full
  knowledge package) — every export cited back to the source moment.
- **Calm, accessible UI.** Reading-first, keyboard-navigable, screen-reader landmarks,
  visible focus, reduced-motion honored; a self-contained single page (zero build step).
- **Thin over KMOS.** Orchestration + UX only; no business logic in the app; the frozen
  kernel (ADR-0012) is untouched. Drives Assets, Language→Knowledge, Governance, Search,
  Events, and Identity. AI stays **provider-independent** behind capability contracts.
- **Durable.** With `KMOS_DATABASE_URL` set, the canonical event log is PostgreSQL-backed
  and read models + search rehydrate on boot — a restarted Studio serves identical
  knowledge, lineage, and trust.

### Honest scope (deferred, architected, reported in the pipeline UI)

- **YouTube auto-download** (yt-dlp) and **speech-to-text** (Whisper/Speaches) need external
  infra; offline you supply the transcript/captions. Both sit behind KMOS capability
  contracts via the `CaptionFetcher`/capability seams.
- **Video clips / Reels** (ffmpeg) — the clip model is defined; rendering is a V2 item.
- **Concept richness** — offline extraction uses a deterministic reference capability;
  connect a production LLM capability (same contract) for richer concepts and definitions.
- **Per-source job state** is in-memory in V1 (canonical knowledge persists in KMOS); run a
  single replica until job-state persistence lands. See ROADMAP + OPERATIONS-GUIDE.

### Engineering

- 23 automated tests (pure-projection unit tests + full KMOS-backed pipeline integration).
- ESLint clean; **0** architecture-fitness violations; full monorepo `tsc --build` green;
  live HTTP verified end-to-end.
- Zero runtime dependencies (node:http, node:crypto). Node 22+.

### Run it

```bash
npm install
npm run studio        # → http://localhost:8090  (UI at /, health at /health)
```

Click **“Try the sample lecture,”** press **Process**, and explore. Docker:
`docker build -f products/knowledge-studio/Dockerfile -t knowledge-studio .` →
`docker run -p 8090:8090 knowledge-studio`.

See [VISION](VISION.md) · [ARCHITECTURE](ARCHITECTURE.md) · [USER-GUIDE](USER-GUIDE.md) ·
[DEVELOPER-GUIDE](DEVELOPER-GUIDE.md) · [API-GUIDE](API-GUIDE.md) ·
[DEPLOYMENT-GUIDE](DEPLOYMENT-GUIDE.md) · [OPERATIONS-GUIDE](OPERATIONS-GUIDE.md) ·
[ROADMAP](ROADMAP.md) · [independent review](INDEPENDENT-REVIEW.md).
