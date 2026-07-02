# KMOS Capability Evolution Roadmap

_Living artifact. The single, citable record of how capabilities move from
application-local code into reusable platform services — and what must be true
before a deferred capability is allowed to move._

_Owner: Platform Architecture. Last updated: 2026-07-01 (KCSI-01, increment 01)._
_Authority: governed by [ADR-0012](adr/0012-architecture-freeze-and-application-driven-evolution.md)
(application-driven evolution) and [ADR-0013](adr/0013-provider-capability-extraction-kcsi-01.md)
(KCSI-01 extraction)._

---

## 1. Why this artifact exists

KMOS evolves from the **evidenced needs of real applications**, not speculation
(ADR-0012). This roadmap operationalizes that rule so it survives beyond any single
initiative or engineer. It enforces two standing requirements:

> **Every _extracted_ capability MUST record its promotion rationale** — the specific
> application code/behavior that justified moving it into the platform.
>
> **Every _deferred_ capability MUST record its promotion trigger** — the concrete,
> observable condition that will justify extracting it later.

If a capability is in the platform, this file says *why it earned its place*. If a
capability is on the wish-list, this file says *exactly what evidence would change the
answer* — so no one has to re-litigate the judgment from memory.

## 2. Lifecycle model

```
Deferred ──(promotion trigger fires: real app evidence)──▶ Proven ──(extraction WP)──▶ Extracted ──(2nd independent consumer)──▶ Generalized
```

| State | Meaning | Required field |
|---|---|---|
| **Deferred** | A plausible capability with **no** current application evidence. Not built. | **Promotion trigger** |
| **Proven** | A real application demonstrates the need (evidence cited), extraction not yet done. | Cited evidence |
| **Extracted** | Lives in the platform behind a contract, tested, conformant, fitness-clean. | **Promotion rationale** |
| **Generalized** | Consumed by ≥2 independent applications; the abstraction is validated by reuse. | Second-consumer citation |

Promotion (Deferred → Proven → Extracted) always: cites the real app requirement,
records an ADR/DECISIONS entry, ships with tests + conformance + `0` fitness
violations, and updates this roadmap in the **same** change. Nothing is extracted
"just in case"; nothing is deferred without saying what would change the decision.

---

## 3. Extracted capabilities (in the platform now)

Each row states its **promotion rationale** (the application evidence that earned the
promotion). Status below reflects KCSI-01 increment 01, approved 2026-07-01; rows are
marked `pending WP<n>` until their work package lands green.

| Capability | Home | Contract | Promotion rationale (cited app evidence) | Since |
|---|---|---|---|---|
| **Provider fallback / graceful degradation** (`withFallback`) | `@kmos/reference-capabilities` | `CapabilityHandler` composition | The **same** try-provider-then-fall-back pattern was hand-rolled **twice, differently**, inside one application: `products/knowledge-studio/src/ollama-extraction.ts:93‑99` (Ollama → reference extractor) and `caption.ts:41‑43` + `studio.ts:218‑225` (HTTP fail → honest degradation). Duplication across two capabilities in a single app is concrete evidence of a cross-cutting primitive; a second app would write a third variant. | **KCSI-01 WP1 (landed)** |
| **LLM knowledge-extraction adapter** (Ollama) | `@kmos/providers` | `KnowledgeExtraction` (existing) | A complete, tested provider adapter (`ollama-extraction.ts`) is trapped in the application behind the existing extraction contract; every knowledge app re-implements the same HTTP-to-LLM adapter. Reuse is concrete, not hypothetical. | **KCSI-01 WP2 (landed)** |
| **Speech-transcription / caption-acquisition adapter** (HTTP: yt-dlp/Whisper/Speaches) | `@kmos/providers` | `Transcription` (existing) | The caption/ASR HTTP adapter (`caption.ts` + `youtube.ts` + `studio.ts:211‑240`) is a reusable transcription/acquisition seam trapped in the app; extraction also resolves a live sync/async `CaptionFetcher` type-smell (`youtube.ts:19` vs `caption.ts:20`). | **KCSI-01 WP3 (landed)** |
| **Platform-substrate SDK** (`createPlatformRuntime`) | `@kmos/sdk` | Composition factory over `platform/*` | `platform.ts:47‑102` is the durable/in-memory + boot-hydration substrate boilerplate **every** KMOS deployable must repeat verbatim (the `applications/*` reference apps each re-do a variant); it is the most-duplicated, most error-prone, purely platform-layer code. | **KCSI-01 WP4 (landed)** |

## 4. Deferred capabilities (not built — with promotion triggers)

Each row states its **promotion trigger**: the concrete condition under which it moves
to *Proven* and is scheduled for extraction. Until the trigger fires, it stays here.

| Capability | Why deferred now (evidence) | **Promotion trigger** | Prospective home |
|---|---|---|---|
| **Media services** — audio extraction, chapters/clips/thumbnails/reels, waveforms (ffmpeg) | No real adapter exists. `ffmpeg`/`Whisper` appear only in stage-label strings (`studio.ts:232,243`, `web.ts:199‑200`); `detectChapters` is a pure in-app projection. | The **first real media adapter** is written — any application performs actual audio extraction/decode or clip/thumbnail/waveform generation from raw media (not a pasted transcript). Then extract a media provider behind a media contract. | `@kmos/providers` + `domains/media` |
| **Language services beyond extraction** — translation, language detection, transliteration, normalization | KS uses only the **reference** `translation` capability (`language-domain-service.ts:26,100`); no real provider adapter exists. | The **first real translation/detection provider adapter** is wired (a second app, or KS in production, replacing the reference translation). One real adapter → extract to `@kmos/providers` behind the existing translation contract. | `@kmos/providers` |
| **Publishing services** — study guide, flashcards, PDF, citation package | KS's `downloads.ts`/`evidence.ts` are pure rendering with a **single** consumer. | A **second independent consumer** needs the same rendered output type (another app, or KS output requested elsewhere). Two consumers → extract a shared publishing capability. | `domains/publishing` |
| **Capability registry / discovery / routing / selection by cost·latency·quality / plugin system** | KS has **exactly one primary + one fallback** per capability and static `if (env)` selection (`index.ts:40‑54`). Zero evidence for dynamic multi-provider selection. Building it now is the "another framework" failure mode ADR-0012 forbids. | An application must **choose among ≥2 live providers for the same capability at runtime** on health/cost/latency/quality — i.e. more than one-primary-one-fallback. Only a real runtime multi-provider requirement unlocks this; design it then, sized to that requirement. | `platform/capability-runtime` (+ registry metadata) |

**Not on the deferral list (already first-class):** Trust and Search are existing
platform services (`governance.assessTrust`, `search.search`) that applications
consume directly — no extraction pending.

---

## 5. Change log

| Date | Change |
|---|---|
| 2026-07-01 | Created under KCSI-01 (ADR-0013 approved as Accepted-plan). Seeded the four extractions (§3, promotion rationale each) and four deferrals (§4, promotion trigger each). |
| 2026-07-01 | WP1 landed: `withFallback` in `@kmos/reference-capabilities` (12 tests pass; fitness clean). Provider fallback/degradation is now a platform primitive. |
| 2026-07-01 | WP2 landed: `@kmos/providers` created; Ollama knowledge-extraction adapter relocated + refactored onto `withFallback` (7 tests pass; fitness clean, 30 packages). |
| 2026-07-01 | WP3 landed: HTTP caption/ASR transcription adapter relocated to `@kmos/providers` with an async `CaptionFetcher` type (fixes the app's dead sync-fetcher smell); 13 package tests pass; fitness clean. |
| 2026-07-01 | WP4 landed: `@kmos/sdk` platform-substrate factory (`createPlatformRuntime[FromEnv]` + `hydratePlatformRuntime`); composes the 8 platform services + boot recovery. 4 tests pass incl. ADR-0011 recovery; fitness clean, 31 packages. |
| 2026-07-01 | WP5 landed: Knowledge Studio refactored onto `@kmos/sdk` + `@kmos/providers`; `caption.ts` + `ollama-extraction.ts` deleted from the app. All 33 KS tests pass (identical behavior). App `src` 2052→1857 LOC (−9.5%), 15→13 files, direct `@kmos/*` deps 13→7; no provider HTTP logic remains in the app. |
| 2026-07-01 | WP6 close-out: full suite 289 pass/1 skip/0 fail, fitness clean, conformance ALL COMPLIANT. Provider Guide + independent reviews + final assessment (review/20). ADR-0013 → Accepted (executed). KCSI-01 increment 01 complete. |

_Maintenance rule: this file is updated in the **same** change that extracts a
capability (add its §3 row + rationale), fires a trigger (move §4 → §3), or defers a
new candidate (add its §4 row + trigger). A capability may not enter the platform
without a §3 row; a candidate may not be deferred without a §4 trigger._
