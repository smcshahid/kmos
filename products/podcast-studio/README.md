# Podcast Studio

**The second flagship KMOS application.** Drop a podcast in, leave with understanding:
a calm, transparent pipeline that turns audio into **verifiable, navigable knowledge** —
transcript, chapters, summary, concepts, evidence, quotes, moments, clips, reels,
subtitles, translations, search, and a downloadable package. Everything is traceable
back to the source moment; nothing is fabricated.

Built on KMOS (KCSI-02). A **thin** product over the platform: it orchestrates
capabilities and presents read models; all business work and canonical knowledge live in
KMOS.

---

## Vision

A listener should be able to: paste a podcast URL / RSS / audio file (or upload), press
**Process**, watch the pipeline honestly, and leave with knowledge they can trust,
search, cite, and download — and come back tomorrow to find it all still there.

The product principles: **calm · transparent · trustworthy.** A visible pipeline. Honest
failures with recovery. Persistent history. Nothing claimed that isn't grounded.

## Features

- **Sources:** paste transcript · audio URL · YouTube · **RSS episode** (feed preview) ·
  upload. Acquisition + ASR run via a provider on the estate; offline, paste a transcript.
- **Understanding:** timestamped transcript · auto **chapters** · extractive **summary** ·
  **concepts** (LLM or reference) each **grounded in a cited quote** · **notable moments**.
- **Media:** **subtitles** (SRT + VTT, generated offline) · **clip & reel plan** (chapter
  clips + a moment-driven highlight reel; rendered via ffmpeg on the estate).
- **Trust:** explainable per-concept trust (reasons, never a bare score); ungrounded
  concepts are marked "needs review", never dressed as trusted.
- **Verifiable knowledge:** every concept links to its evidence passage, lineage
  (transcript ← source), and trust.
- **Daily driver:** search · favorites · collections · persistent history · resume ·
  honest failure/recovery across restarts.
- **Download package:** transcript (md/txt) · subtitles · summary · show-notes ·
  study-notes · concepts.json · citation · full package.json manifest — each cited.

## Quick start

```bash
# Offline / dev (in-memory, paste-a-transcript path):
npm run podcast            # serves http://localhost:8091  (UI at /, health at /health)
```

Environment (all optional — the app degrades honestly without them):

| Variable | Effect |
|---|---|
| `PORT` | HTTP port (default 8091) |
| `KMOS_DATABASE_URL` | Durable PostgreSQL EventLog + job-state; boot recovery (else in-memory) |
| `OLLAMA_URL` (+ `OLLAMA_MODEL`) | Richer LLM concept extraction (else deterministic reference) |
| `PODCAST_TRANSCRIBE_ENDPOINT` (or `KS_CAPTION_ENDPOINT`) | Acquisition/ASR for audio/RSS/YouTube (else paste a transcript) |
| `KMOS_ENFORCE=true` | Require attribution on every write |

## User guide (the calm loop)

1. **Add an episode** — choose a source, paste a reference/transcript, press **Process**.
2. **Watch the pipeline** — each stage shows its mode honestly (`kmos` / `projection` /
   `reference` / `external`) and a one-line detail. Failures are explained; **Retry** is
   always available.
3. **Explore** — read the summary, jump via chapters and moments, open a concept to see
   its definition, evidence quotes (with timestamps), lineage, and trust.
4. **Search** — find concepts across every episode, each hit with a supporting quote.
5. **Curate** — favorite episodes; group concepts into collections.
6. **Download** — export the full package; every artifact cites back to the source.

## Operations & deployment (Olares-first, portable)

Podcast Studio follows the KMOS deployment model (see `documentation/OLARES-DEPLOYMENT-GUIDE.md`
and Knowledge Studio's chart as the reference): an immutable image, secrets injected at
install (never in git/image), FQDN service discovery for providers, and the same shared
PostgreSQL for the durable event log + job state (no duplicate services). It is portable
to vanilla K8s/cloud by changing values/adapters only. `GET /health` reports liveness +
episode count. Verify on the real estate — it is authoritative.

---

_Architecture, developer, and extension guidance: [ARCHITECTURE.md](ARCHITECTURE.md).
Capability assessment + final recommendation: `engineering/review/21-KCSI-02-CLOSEOUT.md`._
