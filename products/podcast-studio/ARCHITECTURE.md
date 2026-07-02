# Podcast Studio — Architecture, Developer & Extension Guide

_KCSI-02._ How Podcast Studio is built, how to work on it, and how to extend it — all
within the [Ecosystem Constitution](../../documentation/ecosystem/ECOSYSTEM-CONSTITUTION.md).

## 1. Architecture (a thin app over KMOS)

```
Podcast Studio (products/podcast-studio) — thin
  http.ts / web.ts        transport + calm UI (no business logic)
  studio.ts               orchestration: the pipeline + read models
  platform.ts             composition: @kmos/sdk substrate + media/language domains
  acquisition/subtitles/  app-owned projections & provider seams
    clips/summary/moments/downloads/episode-store
        │ injects providers        │ reuses shared capability
        ▼                          ▼
  @kmos/providers            @kmos/content-projections     @kmos/sdk
  (Ollama, HTTP ASR)         (transcript/chapters/evidence) (platform substrate)
        └──────────── all business work behind contracts ──────────┘
                                   ▼
                          KMOS platform (knowledge · assets · governance ·
                          events · workflow · search · identity)
```

- **The app owns:** the pipeline choreography, read-model assembly, UI/API, provider
  *selection* (one-line, from env), and product semantics.
- **The app owns NO:** business computation (that's a capability), canonical objects
  (those live in KMOS), or provider SDKs (those are injected adapters).
- **Composition:** `platform.ts` composes the `@kmos/sdk` substrate and adds the two
  domains it orchestrates (media, language). Domain composition stays in the app
  (KMOS-0200 §17); the SDK is substrate-only.

## 2. The pipeline (studio.ts)

`acquire → audio → transcribe → chapters → concepts → evidence → relate → trust →
index → summary → moments → subtitles → clips → package`. Each stage:
- runs a KMOS operation, a pure projection, a reference capability, or is honestly marked
  `external` (needs infra) — the UI shows the mode;
- is idempotent enough to **retry**; a restart mid-pipeline recovers **failed-retryable**;
- produces artifacts that are KMOS Assets (transcript, subtitles) with real lineage, or
  read-model projections (chapters, evidence, clips) over data KMOS already holds.

## 3. Developer guide

- **Run tests:** `npm test -w @kmos/podcast-studio-app` (offline, node:test).
- **Run the app:** `npm run podcast` (in-memory offline; durable with `KMOS_DATABASE_URL`).
- **Add a pipeline stage:** add the id to `StageId` (types.ts) **and** `STAGE_DEFS`
  (studio.ts), then implement it in `runPipeline` using `startStage`/`doneStage`. Keep
  business work in a capability or a pure module; the stage only coordinates.
- **Purity:** projections (transcript/chapters/evidence/subtitles/clips/summary/moments)
  are pure and unit-tested offline. Do all I/O through injected ports/providers.
- **Honesty:** never claim precision you don't have (`timedExactly`), never fabricate a
  quote (absent evidence → nothing), always explain a failure.

## 4. Extension guide (adding a provider)

Podcast Studio never names an engine. To back a capability with a real provider:

1. **Selection is one line** — read config and inject (see `index.ts`):
   ```ts
   const extraction = process.env.OLLAMA_URL ? createOllamaExtraction({ url }) : undefined;
   const transcriptFetcher = endpoint ? makeHttpTranscriptFetcher(endpoint) : undefined;
   ```
2. **Adapters live in `@kmos/providers`**, not in the app. Add a new provider there behind
   the existing contract (see `documentation/PROVIDER-GUIDE.md`), then inject it.
3. **Fallback + resilience** belong to the capability layer (`withFallback`), not the app.
4. **Never** import a provider SDK into the application.

## 5. What KCSI-02 extracted vs kept (evidence-first)

- **Extracted → `@kmos/content-projections`:** transcript, chapters, evidence — because
  Knowledge Studio + Podcast Studio both need the identical pure logic (second consumer).
- **Kept in the app (single consumer — candidates):** subtitles, summary, moments, clips,
  publishing/package, acquisition (RSS), episode-store. Each is recorded in the
  [Capability Evolution Roadmap](../../documentation/CAPABILITY-EVOLUTION-ROADMAP.md) with
  a promotion trigger — extract when a **second** app needs it, not before.

This is the ecosystem's growth rule in action: build first, extract on the second
consumer, keep both apps thin.
