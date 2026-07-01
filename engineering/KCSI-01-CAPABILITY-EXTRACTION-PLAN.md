# KCSI-01 — Capability Extraction Plan

_KMOS Capability Services Initiative, Increment 01._
_Status: **PROPOSED — awaiting owner approval.** No code is changed until this plan
and [ADR-0013](../documentation/adr/0013-provider-capability-extraction-kcsi-01.md)
are approved._
_Authored: 2026-07-01. Baseline: v1.0.0 GA (single-node self-hosted / Olares)._

---

## 1. Mission (as scoped by the owner)

Extract the reusable **capability services** that Knowledge Studio has **already
proven** it needs — provider adapters, provider fallback / graceful degradation,
and a thin application SDK — into the platform, so the next application inherits
them without re-implementation.

This is **evidence-first evolution**, not framework construction. Every abstraction
below **cites the specific Knowledge Studio code that justifies it**. Nothing is
built for a hypothetical future application. When the extraction is complete,
Knowledge Studio must behave **exactly as before**, but its application code must be
**smaller, cleaner, and provider-independent**.

Governing constraints (owner directive + [ADR-0012](../documentation/adr/0012-architecture-freeze-and-application-driven-evolution.md)):

- **No new registries, discovery mechanisms, routing frameworks, orchestration
  engines, or plugin systems** unless Knowledge Studio demonstrates a concrete need.
  It does not — so none are proposed here.
- **No kernel change.** The canonical kernel, constitution, and catalogs are frozen.
- Every change **cites the real application requirement it serves**.

---

## 2. Evidence inventory (what Knowledge Studio proves today)

All references are to `products/knowledge-studio` (the flagship consumer). The thin
`applications/knowledge-studio` (~75-line search facade) contains no provider logic
and is out of scope.

| # | Proven need | Where it lives today (cited) | Problem |
|---|---|---|---|
| E1 | **Provider fallback / graceful degradation** — "try the provider; on any failure fall back / degrade honestly" | `src/ollama-extraction.ts:93‑99` (try Ollama → catch → reference extractor) **and** `src/caption.ts:41‑43` + `src/studio.ts:218‑225` (HTTP fail → `undefined` → honest "needs infra") | The **same pattern is hand-rolled twice, differently**, inside the application. The next app re-implements it a third way. |
| E2 | **LLM knowledge-extraction provider adapter** (Ollama, behind the `KnowledgeExtraction` contract) | `src/ollama-extraction.ts` (whole file) — HTTP to Ollama `/api/chat`, conforms to `ExtractionInput/Output` from `@kmos/reference-capabilities` | A genuinely reusable provider adapter is **trapped in one application**. Any knowledge app re-writes it. |
| E3 | **Speech-transcription / source-acquisition adapter** (HTTP caption/ASR: yt-dlp, Whisper, Speaches behind one tiny HTTP contract) | `src/caption.ts` (HTTP adapter) + `src/youtube.ts` (id parse + injected fetcher) + `src/studio.ts:211‑240` (acquire orchestration) | Reusable transcription/acquisition seam **trapped in one application**; also a live type-smell: `youtube.ts:19` declares a **sync** `CaptionFetcher` while the real fetcher is **async** (`caption.ts:20`) and is invoked separately in `studio.ts`, so the declared seam is dead/misleading. |
| E4 | **Thin application SDK** (platform-substrate composition + durable/in-memory + boot recovery) | `src/platform.ts:47‑102` — hand-composes 8 platform services onto one bus, wires PostgreSQL `EventLog` + DDL, and does `hydrate()` × 5 + `search.rebuild()` on boot | The most-duplicated, most error-prone boilerplate any KMOS app must repeat verbatim. `applications/*` reference apps already each re-do a variant of it. |
| E5 | **Provider selection** ("use provider X when configured, else the reference default") | `src/index.ts:40‑54` (`OLLAMA_URL` / `KS_CAPTION_ENDPOINT` → optional provider) | Real but **near-trivial** (a one-line `if (env)`). See §4 — deliberately **not** abstracted into a standalone mechanism; folded into SDK wiring options. |

The clean injection **seam already exists** and is the model we generalize:
`LanguageDomainService` accepts an optional `extraction?: ReferenceCapability`
(`domains/language/src/language-domain-service.ts:44,91,99`) and the app injects the
Ollama adapter through it (`platform.ts:57‑60`). We are **not inventing** the seam —
we are moving the reusable *implementations* down the stack to sit behind it.

---

## 3. What is NOT proven (defer to a second application, with reasons + triggers)

Honesty about the boundary is a deliverable. These are **explicitly out of scope**
because no current application code demonstrates the need. Per the owner requirement,
each carries a **promotion trigger** — the concrete condition that will later justify
extraction. The authoritative, living record is
[`documentation/CAPABILITY-EVOLUTION-ROADMAP.md`](../documentation/CAPABILITY-EVOLUTION-ROADMAP.md) §4;
summarized here:

| Candidate (from KCSI-01 brief) | Why deferred (evidence) | Promotion trigger |
|---|---|---|
| **Media services** — chapters/clips/thumbnails/reels/waveforms/`ffmpeg` | No real adapter exists in the app. `ffmpeg`/`Whisper` appear **only in stage-label strings** (`studio.ts:232,243`, `web.ts:199‑200`). `detectChapters` is a **pure in-app projection** (`chapters.ts`), not a provider. | First **real media adapter** written — an app performs actual audio extraction/decode or clip/thumbnail/waveform generation from raw media (not a pasted transcript). |
| **Language services beyond extraction** — translation, language detection, transliteration, normalization | KS uses the **reference** `translation` capability only (`language-domain-service.ts:26,100`); no provider adapter is demonstrated. | First **real translation/detection provider adapter** wired (a 2nd app, or KS in production, replacing the reference translation). |
| **Publishing services** — study guide, flashcards, PDF, citation package | KS's `downloads.ts`/`evidence.ts` are **pure rendering with a single consumer**. A `publishing` domain already exists at the domain layer. | A **second independent consumer** needs the same rendered output type. |
| **Capability registry / discovery / routing / health-or-cost/latency/quality-based selection** | KS has **exactly one primary + one fallback per capability** and a static `if (env)` selection. **Zero** evidence for dynamic discovery, multi-provider routing, or quality/cost scoring. Building it now is precisely the "another framework" failure mode the brief and ADR-0012 forbid. **Hard defer.** | An app must **choose among ≥2 live providers at runtime** on health/cost/latency/quality — more than one-primary-one-fallback. |
| **Trust / Search as new capabilities** | Already first-class platform services (`governance.assessTrust`, `search.search`) that KS consumes directly (`studio.ts:310,466`). | N/A — already extracted; not on the deferral list. |

---

## 4. Target architecture (fitness-verified placements)

Enforced layer ranks (`tools/fitness-checks/run.mjs:31‑42`), imports may only point
to **equal/lower** rank:

```
packages 0 · engines/platform 1 · capabilities/sdk 2 · connectors/domains 3 · applications 4 · products 5
```

Every placement below is legal under that rule (verified):

1. **`withFallback` provider-fallback primitive** → **add to
   `capabilities/reference-capabilities`** (it owns the `CapabilityHandler` /
   `ReferenceCapability` contract). A ~20-line pure composition function:
   `withFallback(primary, fallback, { usable? })` returns a `CapabilityHandler` that
   invokes `primary`, and on throw **or** an "unusable" result (predicate; default
   non-empty) invokes `fallback`. Kernel-only dependency. **Serves E1.**
   _Rationale for home:_ avoids a new package for 20 lines; sits with the contract it
   composes. (Owner-tweakable: a dedicated `capabilities/capability-composition`
   package is the alternative.)

2. **`@kmos/providers` — new package under `capabilities/`** holding the two proven
   real provider adapters, each behind an **existing** reference contract:
   - `knowledge-extraction/ollama.ts` — relocated from `ollama-extraction.ts`,
     re-expressed as `withFallback(ollama, referenceExtractor)` (**E1+E2**).
   - `transcription/http.ts` — relocated from `caption.ts`, behind the existing
     `transcription` contract, with graceful degradation (**E1+E3**).
   Legal: `capabilities`(2) → `@kmos/reference-capabilities`(2, equal) ✓. Uses global
   `fetch` (not in `INFRA_MODULES`), so no ports-adapters violation; HTTP adapters
   still placed under `infrastructure/` for clarity.
   _Not a framework:_ a library of concrete adapters, no registry/discovery.

3. **`@kmos/sdk` — promote `sdk/` from templates to a real package** exporting a
   **platform-substrate** factory, e.g. `createPlatformRuntime(options)`, that
   composes the 8 platform services onto one bus, wires the durable PostgreSQL
   `EventLog` + DDL when a URL is present (else in-memory), and performs
   `hydrate()` + `search.rebuild()` on boot — i.e. exactly `platform.ts:47‑102`
   **minus domain wiring**. Returns typed handles. **Serves E4.**
   Legal: `sdk`(2) → `platform`(1) ✓. **`sdk` cannot import `domains`(3)** — so, per
   **KMOS-0200 §17 ("every deployable owns its composition")**, domain composition
   (`MediaDomainService`, `LanguageDomainService` + injected providers) **stays in the
   application**. The SDK removes the substrate boilerplate, not the app's ownership.

4. **Provider selection (E5)** → folded into how the app wires providers (choose
   adapter from config, then inject). **No standalone abstraction** — it is one line;
   abstracting it would be abstraction-for-its-own-sake, which the owner forbade.

**Result for `products/knowledge-studio`:** `ollama-extraction.ts` and `caption.ts`
leave the app (their logic now imported from `@kmos/providers`); `platform.ts`
shrinks to "get the runtime from `@kmos/sdk`, add my domains + injected providers";
`youtube.ts` keeps only pure URL parsing; the sync/async `CaptionFetcher` smell is
resolved. The app gets **smaller and provider-independent**; behavior is unchanged.

---

## 5. Work packages (each: spec/ADR note → code → tests → docs → **roadmap row** → green suite → Conventional Commit)

**Standing definition-of-done (owner requirement):** every work package that extracts a
capability updates
[`documentation/CAPABILITY-EVOLUTION-ROADMAP.md`](../documentation/CAPABILITY-EVOLUTION-ROADMAP.md)
§3 with that capability's **promotion rationale** in the same commit; the deferred set
(§3 above) is mirrored in the roadmap §4 with a **promotion trigger** each. A capability
does not count as "done" without its roadmap row.

Independently verifiable increments, in dependency order:

- **WP0 — Governance (this deliverable).** Plan + ADR-0013 (Proposed) + index/DECISIONS
  entries. _Exit: owner approval._
- **WP1 — `withFallback`** in `@kmos/reference-capabilities` + unit tests (primary
  ok; primary throws → fallback; unusable result → fallback). No behavior change to
  any consumer yet.
- **WP2 — `@kmos/providers` knowledge-extraction (Ollama)**: relocate + refactor onto
  `withFallback`; tests port the existing Ollama-adapter tests (success, Ollama-down →
  reference, malformed JSON → reference) proving **byte-for-byte behavior parity**.
- **WP3 — `@kmos/providers` transcription (HTTP caption/ASR)**: relocate + tests
  (json/plain-text/2xx/non-2xx/timeout → honest degradation); resolve the
  sync/async seam.
- **WP4 — `@kmos/sdk` `createPlatformRuntime`**: compose platform substrate; tests for
  in-memory and durable (fake `SqlClient`, mirroring the existing EventLog contract
  test) incl. `hydrate`/`rebuild`.
- **WP5 — Refactor `products/knowledge-studio`** to consume `@kmos/providers` +
  `@kmos/sdk`; delete the now-duplicated files; **run the full KS test suite +
  `npm run demo`/`serve` smoke → identical behavior**; record LOC delta.
- **WP6 — Close-out**: `npm run conformance` + fitness (0 violations) + full suite
  green; update Developer/Extension/Capability-Development guides + a Provider guide;
  independent reviews (Architecture, Developer-Experience, Maintainability); **final
  architectural assessment** (proven now / wait-for-second-app / why), per owner —
  reconciled against the Capability Evolution Roadmap so the assessment and the living
  record agree.

---

## 6. Behavior-preservation strategy (the core promise)

- Every extracted unit ships with tests **carried over from** or **equivalent to** the
  app's current tests, asserting identical outputs (esp. the two fallback paths).
- WP5 is a **pure relocation + re-wiring**: no pipeline logic in `studio.ts` changes;
  the injection points (`LanguageDomainService.extraction`, `StudioService.captionFetcher`)
  are unchanged interfaces fed from new homes.
- Gate before "done": full `node:test` suite green, `0` fitness violations, all
  conformance profiles COMPLIANT, `demo` + `serve` smoke pass (same as GA gates).
- Success is **measured**, not asserted: report KS `src` LOC before/after and the
  count of provider-touching files removed from the app.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Over-abstraction creeps in (a "framework" emerges) | Scope is frozen to E1–E5; §3 defers the rest **in writing**; reviews in WP6 explicitly test "did we move logic or invent a framework?" |
| SDK tempted to pull domains down-stack | Forbidden by fitness (sdk 2 ✗→ domains 3); SDK is substrate-only; domain wiring stays in the app (KMOS-0200 §17). |
| Behavior drift during relocation | Test parity (§6) + WP5 is relocation-only + demo/serve smoke. |
| Package proliferation for tiny units | `withFallback` goes into an existing package; only **one** new package (`@kmos/providers`) is added. |
| Conflicts with the freeze | Nothing touches kernel/constitution/catalogs; all work is additive at capabilities/sdk/app layers — the freeze’s sanctioned evolution surface. |

---

## 8. Success criteria (this increment)

1. Knowledge Studio behaves exactly as before (tests + demo/serve smoke prove it).
2. `products/knowledge-studio` is measurably smaller and holds **no** provider HTTP
   logic (Ollama/caption bodies gone from the app).
3. `withFallback` + `@kmos/providers` + `@kmos/sdk` exist, tested, conformant, with
   `0` fitness violations, each citing the app code that justified it.
4. A second knowledge app could reuse all three **without touching the app's provider
   code** — demonstrated on paper via the SDK + provider APIs (no second app built).
5. A final architectural assessment states what is now proven, what still waits for a
   second application, and why — the honest boundary this initiative is judged by.
6. The Capability Evolution Roadmap is current and complete: every extracted capability
   has a promotion rationale (§3) and every deferred capability has a promotion trigger
   (§4). No capability entered the platform without a rationale; no candidate was
   deferred without a trigger.

---

## 9. Approval

Proceeding to WP1 requires owner approval of this plan **and** ADR-0013. On approval,
execution is autonomous through WP6, interrupting only for a genuine constitutional
conflict, architectural contradiction, or evidence that invalidates this plan
(owner directive, 2026-07-01).
