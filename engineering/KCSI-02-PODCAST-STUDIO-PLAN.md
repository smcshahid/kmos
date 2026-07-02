# KCSI-02 — Podcast Studio & the Content Processing Spine

_Plan · 2026-07-01 · the second flagship KMOS application, and the capabilities it
reveals._ Governed by the [Ecosystem Constitution](../documentation/ecosystem/ECOSYSTEM-CONSTITUTION.md)
and [ADR-0015](../documentation/adr/0015-podcast-studio-and-content-processing-spine-kcsi-02.md).
Builds on KCSI-01 (`@kmos/providers`, `@kmos/sdk`, `withFallback`) and KEAI-01 (Option B).

## 1. Mission

Build **Podcast Studio** as a complete, daily-usable product — and let it *reveal* the
next generation of reusable capabilities. Podcast Studio is the deliverable; the
capability spine it exposes is the point. Nothing is extracted speculatively; a capability
is extracted only after the application proves it (Constitution Art. IV).

## 2. Product vision

Paste a podcast URL / RSS / upload audio, press **Process**, watch a calm, honest,
visible pipeline, and leave with **verifiable** knowledge: transcript · chapters ·
summaries · concepts · evidence · quotes · clips · reels · subtitles · translations ·
search · a downloadable package. Persistent history, collections, favorites, resume, and
honest failure/recovery. It must feel like something used every day, not a demo.

## 3. Architecture (thin app over KMOS — Constitution Art. I/III)

```
Podcast Studio (products/podcast-studio) — thin
  ├─ composes @kmos/sdk substrate (knowledge, assets, governance, events, search, workflow)
  ├─ its domains: acquisition-journey · enrichment-journey · publication-journey
  ├─ injects providers from @kmos/providers (transcription/ASR, LLM extraction, translation)
  └─ reuses pure projections (transcript, chapters, evidence, packaging) — see §5
  ↓ every step is a capability invoked via the deterministic Workflow Service
  ↓ every artifact is a KMOS Asset with immutable Provenance + lineage; trust is explainable
```

**Offline-honest, Olares-real** (the Knowledge Studio model): with no providers wired the
app degrades honestly (paste-a-transcript path; "needs infra" labels) and is fully
testable offline; real providers (Speaches, Ollama, yt-dlp, ffmpeg) wire in via env on
Olares. This keeps V1 buildable + verifiable here while remaining a real product on the
estate.

## 4. Capability hypotheses (evaluate; extract only if proven)

The brief lists candidates as *hypotheses*. Each is evaluated against the Article II tests
(contract-stable · provider-replaceable · cross-application · kernel-only · deterministic-
core) and only extracted when Podcast Studio + Knowledge Studio *both* demonstrably need it.

| Candidate | Prior evidence | Second-consumer test (this initiative) | Likely verdict |
|---|---|---|---|
| Transcript projection (parse/timecodes) | KS `transcript.ts` (pure) | Podcast needs identical parsing | **Extract** (KS is #1, Podcast #2) |
| Chapter detection | KS `chapters.ts` (pure) | Podcast needs chapters | **Extract** |
| Evidence grounding | KS `evidence.ts` (pure) | Podcast needs quotes/evidence | **Extract** |
| Packaging / downloads | KS `downloads.ts` | Podcast needs downloadable package | **Extract** (publishing capability) |
| Job persistence / recovery | KS `source-store.ts` | Podcast needs history/resume | **Evaluate** (may be an app-kit helper, not a capability) |
| Content acquisition (RSS/audio/YouTube) | media-pipeline `download.py`; KS `youtube.ts` | Podcast needs RSS+audio+YouTube | **Extract** (behind a contract; providers degrade offline) |
| Audio/media processing (clips/reels/subtitles) | media-pipeline `ffmpeg_ops.py`, `clipping.py` | Podcast needs clips/reels/subtitles | **Evaluate/Extract** (ffmpeg behind a contract) |
| Moment detection | media-pipeline `moment_intelligence.py` | Podcast needs highlight moments | **Evaluate** (LLM capability) |
| Summarization | media-pipeline; broadly needed | Podcast needs summaries | **Evaluate/Extract** (LLM capability) |
| Translation | KCSI-01 contract; media-pipeline provider | Podcast needs translations | **Extract** (KEAI-01 near-term win) |
| Timeline / rendering / preservation | AIMPOS/MPP | Not needed by Podcast V1 | **Defer** (record trigger) |

Verdicts are *hypotheses to confirm by building*; the real assessment is WP8.

## 5. Extraction discipline (Constitution Art. IV, IX)

Build first, extract second. The sequence for each proven capability:

1. Podcast Studio consumes the logic (initially by the fastest honest path — importing the
   pure KS module or a local copy).
2. When the duplication/coupling is real and the Article II tests pass, **extract to a
   shared home**, refactor **both** Knowledge Studio and Podcast Studio onto it, and prove
   behavior unchanged (test parity).
3. Record in the [roadmap](../documentation/CAPABILITY-EVOLUTION-ROADMAP.md): promotion
   rationale + future consumers + trigger, in the same change.
4. No registries/discovery/routing frameworks. Refine `withFallback` (quality-tier +
   resilience) only where Podcast Studio proves the need.

Extracted homes (fitness-legal, to confirm per capability):
- Pure text/media projections (transcript, chapters, evidence) → a capability package
  (kernel-only), e.g. `capabilities/content-projections`.
- Acquisition / audio-media / translation providers → `@kmos/providers` (+ a media domain).
- Packaging → `domains/publishing`.
- App-kit helpers (persistence/recovery, provider-wiring) → an application-tier `@kmos/app-kit`
  (NOT `@kmos/sdk`, which may not depend on domains) — evaluated in WP8.

## 6. Work packages (each: code → tests → docs → green suite → Conventional Commit)

- **WP0 — Propose.** This plan + ADR-0015 + Vision. _(this deliverable)_
- **WP1 — Core vertical slice.** Scaffold `products/podcast-studio`; compose SDK + domains;
  pipeline: submit (paste transcript) → transcript → chapters → concepts (LLM/reference) →
  evidence → trust → search → package. Reuse KCSI-01 providers. Tests green. **A real,
  runnable product spine offline.**
- **WP2 — Acquisition.** RSS feed + audio-file + YouTube-audio + upload behind an
  acquisition contract; providers degrade honestly offline. Tests (fakes + parity).
- **WP3 — Audio/media.** Subtitles (SRT/VTT), clips, reels behind an ffmpeg/media contract;
  offline-degrading; tests.
- **WP4 — Summaries + moments.** Summarization + moment detection as LLM capabilities
  (reference fallback offline); tests.
- **WP5 — Publishing/package.** Downloadable package (transcript/subtitles/clips/summary/
  citation); tests.
- **WP6 — Calm UX + durability.** Visible pipeline, honest failures, resume, persistent
  history, collections, favorites, search, downloads; HTTP + web UI (KS pattern). Tests.
- **WP7 — Capability extraction.** Extract the *proven* shared capabilities (transcript/
  chapters/evidence projections; acquisition/media/translation providers; packaging);
  refactor **both** apps; prove parity; roadmap + rationale/trigger per capability.
- **WP8 — Close-out.** Full suite + fitness + conformance green; docs (Vision, Architecture,
  User/Developer/Operations/Deployment/Extension guides, release notes); independent reviews
  (architecture/product/UX/DX/security/performance/Olares/capability); **KCSI-02 Capability
  Assessment** (extracted / app-specific / still-wait / why); **final recommendation** (is
  the capability layer mature enough to make apps the primary focus?).

## 7. Success criteria

1. Podcast Studio is a compelling, daily-usable product (full feature set; calm, honest UX;
   verifiable outputs), runnable + tested offline, Olares-ready.
2. The ecosystem grew **only** through proven extraction — every extracted capability cites
   Podcast+KS evidence, with rationale + trigger; nothing speculative.
3. **KMOS + Knowledge Studio are simpler after than before** (shared projections remove
   duplication; both apps shrink or stay thin).
4. Full suite + fitness + conformance green; docs + reviews complete.
5. A clear, evidence-backed answer to the final question, with the single most valuable next
   initiative if the answer is "not yet".

## 8. Guardrails

- Thin app; business logic only in capabilities; providers invisible + replaceable.
- No kernel/constitution change; no speculative framework; refine, don't rebuild.
- Build first, extract second; behavior-preserving refactors with test parity.
- Olares-first, portable, immutable; honest degradation offline.
