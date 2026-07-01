# Ecosystem Capability Inventory

_KEAI-01 · 2026-07-01._ The complete, classified inventory of ecosystem capabilities,
drawn from KMOS, Knowledge Studio, KCSI-01, AIMPOS, Media Pipeline/MPP, and olares-one.

**Classification:** **Already Exists** (shared/available in KMOS today) ·
**Emerging** (partially present, one consumer) · **Candidate** (strong ≥2-app evidence;
promote when the first KMOS consumer is built) · **Future** (evidence exists but no
near-term KMOS consumer; may never leave its origin app).

**Fields per capability:** Purpose · Consumers · Dependencies · Current implementation ·
Recommended home · Evidence · Promotion rationale (why extracted / would be) · Promotion
trigger (what unlocks it) · Risk · Priority.

The authoritative *lifecycle* record (rationale per extracted, trigger per deferred) is
the [Capability Evolution Roadmap](../CAPABILITY-EVOLUTION-ROADMAP.md); this inventory is
the *catalog*. Where they differ, the roadmap wins.

---

## A. Already Exists (shared in KMOS today)

| Capability | Purpose | Current implementation | Recommended home | Risk | Priority |
|---|---|---|---|---|---|
| **Knowledge / concept model** | Canonical concepts, relationships, vocabulary, collections | `platform/knowledge` (KnowledgeService) | KMOS platform (frozen) | Low | — |
| **Evidence / assets + lineage** | Registered assets, checksums, derivations, chain of custody | `platform/assets` | KMOS platform | Low | — |
| **Identity / attribution** | Orgs, actors, roles, ambient CallContext attribution | `platform/identity` | KMOS platform | Low | — |
| **Governance / trust** | Explainable trust assessment, approvals, policy | `platform/governance` | KMOS platform | Low | — |
| **Events / audit / replay** | Immutable canonical event log, replay, hydrate (ADR-0011) | `@kmos/canonical-kernel` + `platform/events` | KMOS kernel/platform | Low | — |
| **Workflow (deterministic)** | Coordinate capabilities as durable, replayable steps | `platform/workflow` | KMOS platform | Low | — |
| **Search (lexical/semantic projection)** | Rebuildable search over concepts | `platform/search` | KMOS platform | Low | — |
| **Configuration / secrets** | Scoped, profiled config; secret references | `platform/configuration` | KMOS platform | Low | — |
| **Observability** | Metrics, structured logs, health registry | `engines/observability` | KMOS platform | Low | — |
| **Conformance / versioning** | Published contracts; profile compliance | `packages/conformance` | KMOS platform | Low | — |
| **Knowledge extraction (LLM)** | Concepts+definitions from text; provider-independent | `@kmos/providers` (Ollama) + reference; via `LanguageDomainService` | Capability layer (KCSI-01) | Low | — |
| **Speech / caption acquisition (HTTP ASR)** | Transcript/captions from an endpoint (yt-dlp/Whisper/Speaches) | `@kmos/providers` HTTP caption adapter (KCSI-01) | Capability layer | Low | — |
| **Provider fallback / graceful degradation** | Try provider → degrade to reference on error/empty | `withFallback` in `@kmos/reference-capabilities` (KCSI-01) | Capability layer | Low | — |
| **Platform-substrate SDK** | Compose the 8 platform services + boot recovery | `@kmos/sdk` (KCSI-01) | SDK layer | Low | — |

_These need no action; they are the mature core. Consumers: Knowledge Studio today,
every future app tomorrow. Evidence: KMOS v1.0 GA + KCSI-01 (PR #18)._

---

## B. Emerging (present, one consumer — watch)

**Provider adapter library (`@kmos/providers`)** — Purpose: house real provider
adapters behind capability contracts. Consumers: Knowledge Studio. Dependencies:
`@kmos/reference-capabilities`. Current impl: 2 adapters (Ollama extraction, HTTP
caption). Recommended home: capability layer (exists). Rationale: extracted under
KCSI-01 with cited evidence. Trigger to grow: each new adapter needs its own ≥2-app or
1-app-with-planned-second evidence. Risk: **medium** — risk of becoming a dumping
ground; enforce per-adapter evidence. Priority: governance only.

**Translation / language services (beyond extraction)** — Purpose: translate, detect
language, transliterate, normalize. Consumers: Knowledge Studio (reference translation
only today); Media Pipeline (real Ollama translation `hy-mt2:1.8b`, 33 languages).
Dependencies: an LLM/MT provider. Current impl: reference `translation` capability in
KMOS; **real** provider in media-pipeline (`media_tools.py`). Recommended home:
`@kmos/providers` behind the existing translation contract. Evidence: media-pipeline
`services/media_tools.py`; KS `LanguageDomainService`. Rationale: a real provider exists
and a second consumer (KS) uses the contract. Trigger: **first real translation provider
adapter wired into KMOS** (imminent if Media-Pipeline-on-KMOS proceeds). Risk: low.
Priority: **high** (cheap, high-reuse).

---

## C. Candidate (strong ≥2-app evidence; promote when first KMOS consumer is built)

These are the heart of the finding: Media Pipeline + Knowledge Studio (+ AIMPOS)
demonstrate **real cross-application demand**. They were deferred by KCSI-01 for lack of
a second consumer; that consumer now concretely exists (Media Pipeline). Each promotes
when Media Pipeline (or Podcast/Meeting Studio) is built on KMOS.

| Capability | Purpose | Consumers (evidence) | Current impl (reference) | Recommended home | Promotion trigger | Risk | Priority |
|---|---|---|---|---|---|---|---|
| **Source acquisition** | Fetch media/metadata/subtitles from URL/YouTube/playlist/RSS/upload | Media Pipeline, Knowledge Studio | yt-dlp wrappers (`download.py`, `downloader.py`); KS `youtube.ts` | `@kmos/providers` (acquisition) + a media domain | First KMOS media/acquisition consumer built | Med (yt-dlp churn) | **High** |
| **Media processing (ffmpeg)** | Audio extract, transcode, segment, clip, thumbnail | Media Pipeline, Knowledge Studio (audio), AIMPOS (transcode) | `ffmpeg_ops.py`, `clipping.py`; AIMPOS narration/mux | `@kmos/providers` + media domain | First real ffmpeg adapter on KMOS | Med (binary dep) | **High** |
| **Subtitles / captions** | Generate SRT/VTT from timed transcripts | Media Pipeline, AIMPOS (planned) | MPP subtitle tracks; media-pipeline export | Media domain + publishing | Second consumer needs timed subtitle output | Low | Med |
| **Chunking** | Split text (fixed/semantic/sliding/marker/QA) | Media Pipeline, Knowledge Studio (implicit) | `chunking.py` (5 strategies) | `@kmos/providers` or a text capability | Second app needs configurable chunking | Low | Med |
| **Clip / moment intelligence** | LLM-detect key moments; extract clips | Media Pipeline (repurpose), future Studios | `moment_intelligence.py`, `clipping.py`, `repurpose.py` | Capability behind LLM provider | Second app needs moment detection | Med (quality) | Med |
| **Publishing / packaging** | Render transcript/study-guide/citation/ZIP; export formats | Media Pipeline, Knowledge Studio | KS `downloads.ts`; media-pipeline export (MD/TXT/SRT/JSON/ZIP) | `domains/publishing` + capabilities | Second consumer needs the same output type | Low | **High** |
| **Storage tiering / preservation** | Hot/warm/cold + content-addressed (IPFS) durability behind locators | Media Pipeline (core), any large-media app | MPP tiering + IPFS A1; `ipfs_client.py` | KMOS Assets adapter (locators) + a preservation capability | First KMOS app with media at scale | **High** (data) | **High** |
| **Resilience / idempotency library** | Retry+backoff+timeout+idempotency for provider calls | Every provider adapter (cross-cutting) | olares-one retry patterns; MPP adapters | Capability-layer utility (extend `withFallback`) | Second adapter needs resilience (already true) | Low | **High** |

**Shared fields for section C:** Dependencies — the relevant provider (yt-dlp, ffmpeg,
LLM, IPFS) behind a contract; Rationale — the same work is implemented in ≥2 reference
apps and satisfies C1–C5; Evidence — cited files above (media-pipeline `services/*`,
KS `src/*`, AIMPOS `worker/*`). **None should be built until its trigger fires**
(Article IV) — i.e., until a real KMOS consumer exists; premature extraction here is the
exact failure mode to avoid.

---

## D. Future (evidence exists; no near-term KMOS consumer; may stay app-specific)

| Capability | Purpose | Origin evidence | Recommendation | Revisit when |
|---|---|---|---|---|
| **Visual generation (image diffusion)** | Script → storyboard frames | AIMPOS ComfyUI/SDXL/Flux | Keep in Media/Production app behind a capability contract; do **not** generalize now | A second app needs generative images |
| **Talking media / avatar / lip-sync** | Presenter/lip-sync from audio+portrait | AIMPOS EchoMimicV3, MuseTalk, LatentSync | App-specific; capability-first router pattern is the reusable lesson, not the engines | A second app needs presenters |
| **Image-to-video (motion)** | Frame sequence → motion video | AIMPOS WAN 2.2 (uncertified, 14× slow) | **Do not build** — not production-ready by AIMPOS's own evidence | Model maturity + a real consumer |
| **Timeline / EDL editing** | Multi-scene sequencing, conform to NLE | AIMPOS episode/manifest; roadmap EDL | App-specific until a second editing app exists | Second editing consumer |
| **Voice dubbing / diarization** | Multi-speaker separation, dubbing | AIMPOS (out of MVP); WhisperX planned | Defer | A real app requires speaker separation |
| **Character continuity** | Consistent character across scenes | AIMPOS (measured failing without reference images) | **Do not promise** without reference-image architecture | Reference-image capability + demand |
| **Burst / cloud GPU orchestration** | Policy-gated cloud GPU offload | AIMPOS burst + OPA | Infrastructure concern; revisit with multi-node/cloud profile | Cloud/HA profile pulled by demand |
| **Web crawl / research acquisition** | Crawl URLs, extract, synthesize | olares-one AI Hub, CrawlStation, Crawl4AI | Candidate for a Research Studio; defer until built | Research Studio on KMOS |
| **Web search** | Web search + synthesis | olares-one SearXNG via AI Hub | App/provider concern; defer | Second consumer needs web search capability |

---

## E. Application responsibilities (must NOT become shared capabilities)

Recorded explicitly so they are never mis-extracted (Constitution Art. III):

- **Creative generative agents** (story/script/storyboard authoring) — AIMPOS's *product
  domain logic*, not a reusable capability.
- **Deployment-integration adapters** (Jellyfin library sync, Open WebUI KB upload,
  entrance/manifest wiring, `retry-kb-upload.ps1`) — Olares/app operational glue.
- **Provider-workflow internals** (ComfyUI workflow-JSON patching, engine-specific
  prompt shaping) — live *inside* a provider adapter, never surface as a capability.
- **Product semantics** (what "trusted"/"published" mean for a given studio) — each
  application defines its own.

---

## F. Summary — what to do

1. **Do nothing speculative.** Section C stays *candidate* until a real KMOS consumer
   exists. The single highest-leverage action that unlocks most of Section C at once is
   **building Media Pipeline on KMOS** (see [Future Application
   Analysis](KEAI-01-FUTURE-APPLICATION-ANALYSIS.md)).
2. **Cheap, high-reuse, already-evidenced now:** promote **translation** (Section B) and
   ship a **resilience/idempotency** refinement to the adapter pattern (Section C) —
   both have present evidence and low risk.
3. **Refine KCSI-01, don't rebuild it:** add quality-tier metadata + fail-closed
   semantics to the provider/fallback pattern (evidenced by AIMPOS).
4. **Guard Section D/E:** they are documented precisely so they are not mistaken for
   ecosystem capabilities.
