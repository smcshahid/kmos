# KMOS Ecosystem Status

_The one-page operational dashboard. "Where is the ecosystem today?"_
_Last updated: 2026-07-02 (EPT-01). Authoritative snapshot; the [KMOS Book](THE-KMOS-BOOK.md)
is the handbook, this is the status board._

## Platform

| | |
|---|---|
| **Status** | GA — production (single-node self-hosted / Olares). Kernel **frozen** (ADR-0012). |
| **Current version** | Ecosystem **v1.1.0** (platform + capability layer + 2 flagships). Kernel v1.0.0 frozen. |
| **Phase** | **Platform Phase 1 CLOSED**; organization in the **Product Era** (EPT-01). |
| **CI** | Green on `main` (static: lint · fitness · `tsc` · audit; tests: unit · contract · security · integration · perf · certification · conformance · demo; database: real PostgreSQL). |
| **Packages** | 33 workspace packages; architecture-fitness **0 violations**. |

## Capability layer

| | |
|---|---|
| **Maturity** | Established + evidence-validated (KCSI-01, KCSI-02). Extraction discipline proven twice. |
| **Shared capabilities** | `@kmos/content-projections` (transcript/chapters/evidence) · `@kmos/providers` (knowledge-extraction: Ollama + OpenAI-compatible; HTTP ASR) · `@kmos/reference-capabilities` (+ `withFallback`) · `@kmos/sdk` (platform substrate) · platform services (knowledge, assets, governance, events, workflow, search, identity, configuration). |
| **Model** | Capability contract = stable interface; providers swap by config; no registry/framework. |
| **Roadmap** | Evidence-first, in [CAPABILITY-EVOLUTION-ROADMAP](CAPABILITY-EVOLUTION-ROADMAP.md) (rationale per extracted, trigger per deferred). |

## Applications

| App | Status | Purpose |
|---|---|---|
| **Knowledge Studio** | Complete (flagship #1) | Media → verifiable, navigable knowledge |
| **Podcast Studio** | Complete (flagship #2) | Podcasts/audio → transcript, chapters, summary, concepts, evidence, clips, subtitles, package |
| Reference apps | present | thin demonstrations (research-portal, archive-explorer, administration, public-api, learning-platform, api-server) |

## Deployment

| | |
|---|---|
| **Docker** | Self-verifying images; **all three published + public at `1.1.0`**: `docker.io/malikshahid85/{kmos, knowledge-studio, podcast-studio}`. |
| **GitHub Releases** | Authoritative download location. **"KMOS Ecosystem v1.1.0" released** (assets: `kmos-1.1.0.tgz` + `SHA256SUMS.txt`). Automated via `.github/workflows/release.yml` (tag `v*` → 3 images + Olares chart + checksums + notes). |
| **Olares** | Reference target (validated on real Olares, ADR-0010/0011); Application Chart in `deployment/olares/`; portable to K8s via values. |

## AI providers

| | |
|---|---|
| **Supported (by config)** | reference (offline) · Ollama (local) · **OpenAI-compatible** (OpenAI, Azure OpenAI, Groq, DeepSeek, OpenRouter, Mistral, Together). |
| **Switching** | Configuration only (`KMOS_LLM_PROVIDER`/`BASE_URL`/`MODEL`/`API_KEY`) — **no application change**. |
| **Extension points** | Native APIs (Gemini, Claude, Bedrock, Cohere; DeepL/Azure Translator; Azure Speech/Deepgram) = one adapter + config, apps unchanged. See [PROVIDER-GUIDE](PROVIDER-GUIDE.md). |

## Roadmap / focus

| | |
|---|---|
| **Current organizational focus** | **Product-first.** Build applications; capabilities are pulled into existence by real product need (evidence-first). |
| **Platform investment** | Minimal / demand-pulled (~10%). Next likely capability initiative: media providers (ffmpeg/translation/preservation) — only when a media-heavy app pulls them. |
| **Governing rule** | *No platform enhancement unless demanded by a real application or clear multi-application evidence* (Ecosystem Constitution Art. XI / ADR-0018). |

_Detail everywhere: [Documentation Index](README.md) · [The KMOS Book](THE-KMOS-BOOK.md)._
