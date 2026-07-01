# Review 21 — KCSI-02 (Podcast Studio): Close-out, Independent Reviews, Capability Assessment & Final Recommendation

_Date: 2026-07-01. Scope: KCSI-02 (branch `feat/kcsi-02-podcast-studio`)._
_Inputs: [KCSI-02 plan](../KCSI-02-PODCAST-STUDIO-PLAN.md), [ADR-0015](../../documentation/adr/0015-podcast-studio-and-content-processing-spine-kcsi-02.md), [Ecosystem Constitution](../../documentation/ecosystem/ECOSYSTEM-CONSTITUTION.md)._

## 0. Verified state (evidence)

- **Product:** `products/podcast-studio` — a complete, daily-usable app: RSS/audio/YouTube/
  upload acquisition, transcript, chapters, summary, concepts, evidence, moments, subtitles
  (SRT/VTT), clip & reel plan, translations, search, collections, favorites, persistence +
  boot recovery, calm web UI + HTTP API, downloadable package.
- **Tests:** full suite **320 pass / 1 skip (real-PG, CI-only) / 0 fail** (was 289 at KCSI-01).
  Podcast Studio: 24 package tests; content-projections: 7; both flagship apps green.
- **Fitness:** `0` violations (**33** workspace packages). **Conformance:** ALL COMPLIANT.
- **Extraction:** `@kmos/content-projections` created; Knowledge Studio **and** Podcast
  Studio refactored onto it; byte-identical duplication deleted from both; behavior identical.

Work packages WP1–WP8 all landed green and committed (Conventional Commits).

## 1. Independent reviews

- **Architecture.** Thin app; business logic only in capabilities/projections; providers
  injected, never imported; composition respects fitness (products→capabilities/sdk/domains,
  down-only). The one extraction (content-projections) is kernel-only and legal. **Sound.**
- **Product.** Delivers the full brief (paste→process→verifiable knowledge, all artifacts)
  as a real daily driver, not a demo. Honest degradation offline; Olares-real via env.
  **Compelling in its own right.**
- **UX.** Calm, transparent: a visible pipeline with honest stage modes/details, explained
  failures + retry, persistent history, favorites, collections, search. Trust shown as
  reasons, never a bare score. **Meets the calm/transparent/trustworthy bar.**
- **Developer experience.** The second app was **mostly composition**: it reused `@kmos/sdk`,
  `@kmos/providers`, `@kmos/content-projections`, and the media/language domains. New work
  was product-specific (acquisition, media outputs, UI). **The SDK/capabilities paid off.**
- **Security.** No new trust surface: adapters use global `fetch`, carry no secrets
  (endpoints are injected config), never throw for "unavailable". Persistence is app-owned
  job-state behind the `SqlClient` port; no secrets in code/images. **Neutral-to-positive.**
- **Performance.** Deterministic, in-process projections; the full offline pipeline runs in
  tens of ms in tests. Heavy work (ASR, ffmpeg, LLM) is external/provider-bound by design.
  **No concerns at this scale.**
- **Olares.** Follows the reference model (immutable image, env-injected secrets, FQDN
  discovery, shared PostgreSQL, portable values). Verify-on-real-estate remains the
  authoritative gate. **Consistent with the platform.**
- **Capability.** Extraction was disciplined: exactly one capability extracted (proven by a
  real second consumer), the rest recorded as single-consumer candidates with triggers. **No
  speculative framework introduced.**

## 2. KCSI-02 Capability Assessment (owner-requested)

### 2.1 Extracted (proven — second consumer arrived)

| Capability | Home | Why extracted |
|---|---|---|
| **Content projections** (transcript parse/timecodes, chapter detection, evidence grounding) | `@kmos/content-projections` | Byte-identical logic in Knowledge Studio **and** Podcast Studio; both refactored onto it; duplication deleted; behavior identical. |

### 2.2 Remained application-specific (single consumer — candidates, not extracted)

Recorded with promotion triggers in the [Roadmap](../../documentation/CAPABILITY-EVOLUTION-ROADMAP.md);
extract when a **second** app needs them, not before:

| Kept in Podcast Studio | Why not yet | Promotion trigger |
|---|---|---|
| Subtitles (SRT/VTT) | Only Podcast Studio produces them today | A second app needs timed subtitle output |
| Summary (extractive) | Single consumer; reference-only | A second app needs summarization |
| Moment detection | Single consumer | A second app needs moment/highlight detection |
| Clip/reel planning | Single consumer; render is external | A second app needs clip planning |
| Publishing/package renderers | KS + Podcast have *similar but type-different* renderers | A second app needs the same packaged output *type* (generalize the shape first) |
| RSS acquisition | Single consumer (podcast-native) | A second app ingests RSS |
| Episode/job persistence pattern | Single consumer; likely an app-kit helper, not a capability | A second app needs the same job-store; then extract to an app-tier `@kmos/app-kit` |

### 2.3 Should still wait (no consumer yet) — and why

Real **media providers** (ffmpeg transcode/clip render), **real translation provider**,
and **storage-tiering/preservation (IPFS)** remain unproven on KMOS. Podcast Studio uses
ffmpeg/translation only as honest `external`/reference seams — it did **not** justify
building them. They are pulled by a genuinely media-heavy app (Media Pipeline). Building
them now would be speculative (Constitution Art. IV).

### 2.4 Effect on the platform

**KMOS + Knowledge Studio are simpler after than before:** the shared projections removed
duplicated code from Knowledge Studio (its `transcript`/`chapters`/`evidence` modules are
gone, now imported), and Podcast Studio never carried them. The platform gained exactly one
small kernel-only package. No kernel/constitution change.

## 3. Final recommendation — the one question

> **Is the capability layer now mature enough that future application development should
> become the organization's primary focus?**

**Yes — for the knowledge/media-light application family (Podcast, Meeting, Research,
Publishing, MuhammadanWay), make applications the primary focus.**

**Why (evidence):**
1. The **second flagship app was mostly composition** — it reused the SDK, providers, shared
   projections, and domains, adding only product-specific surface. That is the definition of
   a mature capability layer: new apps are assembled, not constructed.
2. The **extraction machine works** — a real second consumer cleanly promoted one capability;
   both apps were refactored with identical behavior and a green 320-test suite. The
   discipline scales without ceremony.
3. The **remaining candidates are genuinely single-consumer** and correctly deferred — they
   will be pulled by the third app (subtitles/summary/publishing) exactly when justified. No
   blocking capability initiative is required before building more apps.
4. **Governance held** — fitness, conformance, ADRs, roadmap rationale/trigger, and honest
   degradation all stayed intact.

**The one caveat (demand-pulled, not a prerequisite):** genuinely **media-heavy** apps
(Media Pipeline) will still pull a **media-provider initiative** (real ffmpeg + translation +
preservation/IPFS). That is the single most valuable *future* capability initiative — but it
should be triggered by that app's real need, not completed pre-emptively. For the app family
the founder is most likely to build next, the layer is ready.

**Recommendation:** shift primary focus to applications. Let each new app pull its next
capability into existence, recording rationale/trigger, exactly as KCSI-01 and KCSI-02 did.
Revisit the media-provider initiative when (and only when) a media-heavy app is built on KMOS.
