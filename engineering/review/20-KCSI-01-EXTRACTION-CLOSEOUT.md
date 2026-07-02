# Review 20 — KCSI-01 Capability Extraction: Close-out, Independent Reviews & Final Architectural Assessment

_Date: 2026-07-01. Scope: KCSI-01 increment 01 (branch `feat/kcsi-01-capability-extraction`)._
_Inputs: [KCSI-01 plan](../KCSI-01-CAPABILITY-EXTRACTION-PLAN.md), [ADR-0013](../../documentation/adr/0013-provider-capability-extraction-kcsi-01.md), [Capability Evolution Roadmap](../../documentation/CAPABILITY-EVOLUTION-ROADMAP.md)._

## 0. Verified state (evidence)

- **Tests:** full suite **289 pass, 1 skipped (real-Postgres, CI-only), 0 fail** (was 217 at GA). New: `withFallback` (+7), `@kmos/providers` (13), `@kmos/sdk` (4); Knowledge Studio **33 pass, unchanged behavior**.
- **Fitness:** `node tools/fitness-checks/run.mjs` → **0 violations** (31 workspace packages).
- **Conformance:** `npm run conformance` → **ALL PROFILES COMPLIANT**.
- **Application impact:** `products/knowledge-studio/src` **2052 → 1857 LOC (−9.5%)**, 15 → 13 files, direct `@kmos/*` deps **13 → 7**; **zero** provider HTTP logic remaining in the app.

Delivered: `withFallback` (WP1), `@kmos/providers` with Ollama + HTTP caption/ASR adapters (WP2–3), `@kmos/sdk` platform-substrate factory (WP4), Knowledge Studio refactor (WP5). One new package (`@kmos/providers`) + one promoted package (`@kmos/sdk`) + one primitive. No kernel/constitution/catalog change.

---

## 1. Independent reviews

### 1.1 Architecture
The extraction respects the enforced layering (`packages 0 · platform/engines 1 · capabilities/sdk 2 · domains 3 · applications 4 · products 5`); every new import points down or sideways. The critical constraint — **the SDK may not import domains** — is honoured: `@kmos/sdk` composes only the platform substrate and domain composition stays in the app (KMOS-0200 §17). No registry/discovery/routing was introduced; the runtime remains single-active-implementation. **Verdict: sound; no redesign; additive only.**

### 1.2 Developer experience
A new application now writes `createPlatformRuntimeFromEnv()` instead of ~55 lines of substrate wiring + boot recovery, and injects a provider from `@kmos/providers` instead of hand-rolling an HTTP adapter + fallback. The [Provider Guide](../../documentation/PROVIDER-GUIDE.md) shows the full add-a-provider and consume-a-provider paths. **Verdict: materially simpler; the app got smaller against a real metric.**

### 1.3 Maintainability
Provider fallback existed in two hand-rolled variants; it is now one tested primitive (`withFallback`) with a single behavior. Provider HTTP shapes (Ollama `/api/chat`, caption endpoint) live in one package with focused tests, not interleaved with product code. The Capability Evolution Roadmap records why each unit exists and what would justify the deferred ones. **Verdict: duplication removed; provenance explicit.**

### 1.4 Security / Scalability (brief)
No new trust surface: adapters use the global `fetch`, carry no secrets (endpoints/URLs are injected config), and never throw for "unavailable" (honest degradation, no partial-failure leakage). No change to persistence, identity, or the event log — scalability characteristics are unchanged from GA. **Verdict: neutral-to-positive; nothing to flag.**

### 1.5 Findings / follow-ups (non-blocking)
- The WP3 commit message said the async `CaptionFetcher` "fixes the app's dead sync-fetcher smell." Correction for the record: `youtube.ts`'s optional **sync** fetcher is **not** dead — `test/projections.test.ts:63` exercises it — so it was intentionally left in place. The canonical async acquisition adapter now lives in `@kmos/providers`; the app-local sync helper remains a pure convenience. No code impact.
- `dist/` build artifacts were not regenerated offline (no `tsc` in this environment); CI builds them. Tests run from source via the dev resolver. Consistent with DECISIONS D-E.

---

## 2. Final architectural assessment (owner-requested)

### 2.1 What is now proven and extracted

| Capability | Home | Promotion rationale (why it earned platform status) |
|---|---|---|
| Provider fallback / graceful degradation (`withFallback`) | `@kmos/reference-capabilities` | The pattern was hand-rolled twice in one app across two capabilities — cross-cutting by demonstration. |
| LLM knowledge-extraction (Ollama) | `@kmos/providers` | A complete, tested adapter behind an existing contract, previously trapped in the app. |
| Speech-transcription / caption acquisition (HTTP) | `@kmos/providers` | Same; a reusable acquisition seam behind the transcription contract. |
| Platform-substrate SDK | `@kmos/sdk` | The most-duplicated, purely platform-layer boilerplate every deployable repeats. |

### 2.2 What should wait for a second application (and the trigger that unlocks it)

| Deferred | Promotion trigger |
|---|---|
| Media services (ffmpeg: audio/clip/thumbnail/waveform) | First real media adapter — an app decodes raw media, not a pasted transcript. |
| Language services beyond extraction (translation/detection/…) | First real translation/detection provider adapter is wired. |
| Publishing services (study guide/flashcards/PDF/citation) | A second independent consumer needs the same rendered output. |
| Capability registry / discovery / routing / cost-latency-quality selection / plugins | An app must choose among ≥2 live providers at runtime — more than one-primary-one-fallback. |

**Why defer, restated:** every deferred item has exactly zero current application evidence; the app has one primary + one fallback per capability and static config selection. Building any of them now would be the "another framework" outcome ADR-0012 forbids.

### 2.3 Answers to the initiative's final-review questions

1. **Generic enough for the next decade?** For what applications *prove*, yes; the seam is the capability contract, which outlives providers. We did **not** speculatively generalize beyond evidence — by design.
2. **Abstracted at the right level, or just moved provider logic?** Right level: provider logic moved *down* behind existing contracts and a single fallback primitive; it did not reappear elsewhere (the app now has none).
3. **Simple enough for app developers?** Yes — `createPlatformRuntimeFromEnv()` + inject a provider; the Provider Guide is one page.
4. **New providers without modifying existing apps?** Yes — add an adapter in `@kmos/providers`; apps opt in by injection.
5. **New apps without understanding infrastructure?** Yes — the SDK hides substrate + recovery; domains + a thin UI remain the app's concern.
6. **KMOS constitutional principles preserved?** Yes — no kernel/constitution/catalog change; layering and conformance enforced; attribution/governance untouched.
7. **Premature abstraction avoided?** Yes — one new package, one primitive; four candidate families explicitly deferred with triggers.
8. **Genuine platform capability, not another framework?** Yes — no registry/discovery/routing/plugin machinery; only concrete adapters + composition behind existing contracts.

### 2.4 Recommendation
KCSI-01 increment 01 is **complete and green**. Merge to `main` via PR. The next capability move should be **pulled** by the next real application (MuhammadanWay, Podcast/Meeting/Research Studio) and must, per the standing rule, cite its evidence and record a roadmap promotion rationale — or, if deferred, a trigger.
