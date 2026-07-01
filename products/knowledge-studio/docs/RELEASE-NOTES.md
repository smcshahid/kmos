# Knowledge Studio — Release Notes

## v1.1.1 — Frictionless YouTube + richer concepts

- **Frictionless YouTube:** the caption/ASR sidecar (yt-dlp + Whisper/Speaches, image
  `knowledge-studio-caption`) lets a raw YouTube URL process end-to-end via
  `KS_CAPTION_ENDPOINT`. Enable with `captionService.enabled` + `captionService.speachesUrl`.
- **Richer concepts:** provider-independent Ollama extraction behind the KMOS contract
  (ADR-KS-0002), with graceful fallback. Enable with `ollama.url`.
- Clean image bump (`1.1.1`) so Olares pulls the new build unambiguously. Chart validated
  with helm; full repo verify 265 pass / 0 fail.

## v1.1.0 — Daily driver: durable, deployable, reliable

The operational-validation release that turns V1 from a demonstration into a tool you can
use every day. **Come back tomorrow, and everything is still there.**

### Highlights

- **Durable job-state (the daily-driver linchpin).** A processed source's full experience
  — transcript, chapters, per-concept trust, favorites, job history — now survives a
  restart, persisted in the **same shared PostgreSQL** the KMOS event log uses (no
  duplicate services). **Proven against real PostgreSQL:** process → kill → restart →
  `recovered sources: 1`, concept view still verifiable (evidence @12s, lineage, trust),
  search intact.
- **Daily-driver UX.** Library with **Favorites** + **Recent** (persistent job history),
  **Retry** for failed/interrupted sources, favorite stars, and **YouTube auto-detect** in
  the composer.
- **Reliability.** A source interrupted by a restart recovers as **failed-and-retryable**;
  every failure mode (empty/junk transcript, YouTube-without-infra, caption timeout,
  storage hiccup) degrades gracefully with a meaningful message — no crashes.
- **Production caption/ASR seam.** A provider-independent HTTP capability
  (`KS_CAPTION_ENDPOINT`) lets YouTube URLs process end-to-end where yt-dlp/Whisper/Speaches
  exists; degrades honestly when absent. Never couples to one provider.
- **First-class Olares packaging.** A Knowledge Studio Application Chart (OlaresManifest +
  Helm) as a **companion to the KMOS deployment**, sharing its PostgreSQL (one institutional
  memory), with shared-DB (recommended) and isolated modes. Self-proving Docker image.
- **Repo quality.** Architecture-fitness now scans `products/` (0 violations); 30 tests
  (adds persistence + caption suites); ADR-KS-0001.

### Verified locally (evidence over assertions)

Real-PostgreSQL restart persistence; image build (self-proving) + run + health; performance
(15 ms sample, 0.05 ms concept view); all failure modes graceful. **Not** verified: the live
Olares apply (no cluster access) — a full runbook + checklist is provided
([OLARES-DEPLOYMENT.md](OLARES-DEPLOYMENT.md)), and nothing claims a deployment that hasn't
happened. See [OPERATIONAL-VALIDATION.md](OPERATIONAL-VALIDATION.md) and
[DAILY-DRIVER-ASSESSMENT.md](DAILY-DRIVER-ASSESSMENT.md).

### New configuration

| Env | Purpose |
|---|---|
| `KMOS_DATABASE_URL` | Shared/durable PostgreSQL (event log + job state); unset → in-memory |
| `KS_CAPTION_ENDPOINT` | Provider-independent caption/ASR HTTP capability for YouTube |

---

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
