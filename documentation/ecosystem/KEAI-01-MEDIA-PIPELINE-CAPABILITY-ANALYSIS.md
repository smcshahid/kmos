# Media Pipeline Capability Analysis

_KEAI-01 · 2026-07-01._ **This analyzes capabilities, not applications, and does not
migrate code.** Media Pipeline (and its ancestor AIMPOS) is engineering *evidence*. The
guiding question is the brief's first principle: **if we built Media Pipeline today on
KMOS, what reusable capabilities would naturally exist — and which would stay inside the
application?**

## 1. What Media Pipeline is (two generations)

- **AIMPOS** (`AI Production Media`) — the mature ancestor: idea→script→storyboard→
  narration→video with Temporal + LangGraph agents, human approval gates, MinIO/Postgres/
  Neo4j, EchoMimic/ComfyUI. Generative *production*.
- **Media Pipeline / MPP** (`olares-one/apps/media-pipeline`, v3.19.1; governed by the
  `Media Processing Platform` docs) — the current, leaner **preservation-and-knowledge**
  system: YouTube→yt-dlp→Whisper→Jellyfin + Open WebUI KB, catalog-first (Postgres 14
  tables), tiered storage + IPFS. Acquisition, enrichment, publication of *owned* media.

They share a spine; Media Pipeline is the near-term shape a KMOS media app would take.

## 2. Capability classification (the core deliverable)

### 2.1 Should become ecosystem capabilities (provider-independent, ≥2-app evidence)

| Capability | Why it's ecosystem-grade | KMOS home | Contract seam |
|---|---|---|---|
| **Source acquisition** (URL/YouTube/playlist/RSS/upload; metadata; subtitle-detect) | Needed by Media Pipeline *and* Knowledge Studio; provider-replaceable (yt-dlp today, others tomorrow) | `@kmos/providers` + a media domain | `Acquire(source) → Asset + Provenance` |
| **Speech / ASR** | Already extracted (KCSI-01 caption adapter); Media Pipeline uses Speaches, KS uses the same HTTP contract | `@kmos/providers` (exists) | `Transcribe(audioRef) → Transcript` |
| **Media processing** (audio-extract, transcode, segment, clip, thumbnail) | ffmpeg is a classic replaceable engine; both apps need it | `@kmos/providers` + media domain | `Process(media, op) → Derivative` |
| **Language / translation** | Real provider exists (Ollama MT); contract already in KMOS | `@kmos/providers` | `Translate(text, lang) → text` |
| **Chunking / text segmentation** | 5 strategies, reused by any RAG/knowledge app | text capability | `Chunk(text, strategy) → chunks` |
| **Subtitles** | Timed-text generation from transcripts; reusable | media/publishing | `Subtitle(transcript) → SRT/VTT` |
| **Publishing / packaging** | Export formats + citation/study-guide packages; both apps produce them | `domains/publishing` | `Publish(knowledge, format) → artifact` |
| **Storage tiering / preservation** | Hot/warm/cold + content-addressed durability behind locators | KMOS Assets adapter + preservation capability | `Locate/Preserve(asset, tier)` |
| **Moment / clip intelligence** | LLM moment detection → clips/repurpose; reusable across media apps | capability behind LLM provider | `Moments(transcript) → spans` |

Each satisfies the Article II tests (contract-stable, provider-replaceable,
cross-application, kernel-only, deterministic-core). **None should be built until a real
KMOS consumer exists** (Article IV) — Media Pipeline-on-KMOS is that consumer.

### 2.2 Should remain application-specific (orchestration / product semantics)

- **The ingest→enrich→publish pipeline choreography** — the *sequence* is the app's
  product; the *steps* are capabilities. (Knowledge Studio's pipeline and Media
  Pipeline's differ; both call shared capabilities.)
- **Lifecycle semantics** — what Registered/Enriched/Published/Archived mean for *this*
  media estate. (A great pattern to generalize as an event vocabulary — see §4 — but the
  specific states are the app's.)
- **Catalog/faceted-browse UX, dashboards, download center** — application surface.
- **Policy defaults** — batch limits, translate allowlists, retention — app/governance
  configuration.

### 2.3 Should never leave Media Pipeline / AIMPOS

- **Generative creative agents** (story/script/storyboard authoring) — product domain
  logic, not a capability.
- **Avatar / lip-sync / image-diffusion / i2v engines** — specialized; the *capability-
  first router* pattern is the transferable lesson, not the engines. (i2v is not even
  production-ready by AIMPOS's own benchmark.)
- **Jellyfin / Open WebUI / ComfyUI integration glue** — deployment adapters.
- **Character-continuity machinery** — requires reference-image architecture AIMPOS
  hasn't built; do not surface as an ecosystem promise.

## 3. What a KMOS-native Media Pipeline would look like

```
Media Pipeline (thin application)
  ├─ composes @kmos/sdk substrate (knowledge, assets, governance, events, search, workflow)
  ├─ its own domains: acquisition-journey, enrichment-journey, publication-journey
  └─ injects providers from @kmos/providers:
        acquire(yt-dlp) · transcribe(Speaches) · translate(Ollama) · process(ffmpeg) · preserve(IPFS)
  ↓ every step is a capability invoked via the deterministic Workflow Service
  ↓ every artifact is a KMOS Asset with immutable Provenance + lineage
  ↓ lifecycle transitions are canonical events; trust is explainable; search is a projection
```

The app shrinks to journeys + UI; the media capabilities become shared; the knowledge,
evidence, governance, and search come free from KMOS. This is the same subtraction
KCSI-01 achieved for Knowledge Studio (−9.5% app code, zero provider logic), applied to
a richer domain.

## 4. Two patterns worth generalizing into KMOS (evidence-cited)

1. **Business-lifecycle events vocabulary.** MPP's explicit
   `Identified→Registered→Enriched→Published→Archived` (distinct from job state) is a
   strong idea. KMOS already has canonical events; a **reusable lifecycle-event helper**
   (not a kernel change) could let any app declare and emit business-lifecycle
   transitions consistently. *Defer* until a second app needs it — but record the
   trigger.
2. **Storage locators + content-addressed preservation.** MPP records *where* content
   lives (hot/cold/IPFS CID) behind the catalog, and pins durable text 100% / media
   selectively. KMOS Assets has `storageRef`; a **tiering/preservation adapter** behind
   that port is the natural home. *Highest-value, highest-risk* candidate — data
   durability — so it must be pulled by a real media app and verified on real Olares.

## 5. Verdict

Media Pipeline is the **single most valuable forcing function** for the capability
layer: building it on KMOS would legitimately promote ~8 candidate capabilities at once,
each with genuine second-consumer evidence, while keeping the generative/specialized
parts (AIMPOS's frontier) firmly inside the application. It converts KCSI-01's deferred
list from "waiting for evidence" into "evidence has arrived" — which is exactly how the
ecosystem is supposed to grow.
