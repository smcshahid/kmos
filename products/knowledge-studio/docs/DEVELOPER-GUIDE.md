# Knowledge Studio — Developer Guide

For engineers extending or maintaining Knowledge Studio. It assumes you know KMOS
exists as a platform; you do not need to know its internals to be productive here,
but you must respect its boundary. For the *why* and the layered picture, read
[`ARCHITECTURE.md`](ARCHITECTURE.md) first — this document is the *how*.

---

## Architecture in brief

Knowledge Studio is a **thin product layer over KMOS**: orchestration + UX only. It
owns **no business logic and no canonical objects**. Concepts, assets, evidence,
lineage, trust, relationships, and collections all live in KMOS and are reached
through their **public business APIs** — the app **bypasses nothing** (KMOS-9999 §9).
The KMOS kernel is frozen (ADR-0012); you extend the product, not the platform.

The app does exactly three things: (1) compose the KMOS services it needs onto one
event bus; (2) orchestrate a visible processing pipeline; (3) assemble read-time
**projections** (evidence quotes, chapters) over data KMOS already holds. Everything
else is transport (`node:http`) and UX (a self-contained SPA string).

It is an npm workspace, `@kmos/knowledge-studio-app`, Node 22+, TypeScript, ES
modules with `.js` import specifiers, **zero runtime dependencies** (`node:http`,
`node:crypto` only). All AI and heavy infra live behind KMOS capability contracts.

---

## Repository layout & module responsibilities

```
products/knowledge-studio/
  src/
    platform.ts     KMOS composition root — wires services on one shared EventBus
    studio.ts       StudioService — the orchestrator (pipeline + read models)
    transcript.ts   PURE projection: raw text -> timestamped segments
    chapters.ts     PURE projection: segments -> readable outline
    evidence.ts     PURE projection: term + segments -> grounding quotes
    youtube.ts      URL parsing + CaptionFetcher seam (yt-dlp/Whisper adapter)
    downloads.ts    PURE renderers: Source/ConceptView -> download artifacts
    http.ts         createStudioServer — node:http router (transport only)
    web.ts          STUDIO_HTML — self-contained SPA string
    sample.ts       bundled sample lecture (title + transcript)
    types.ts        product read-model + job-state types
    index.ts        entry point + re-exports
  test/             projections.test.ts, transcript.test.ts, studio.test.ts
```

The **pure** modules (`transcript`, `chapters`, `evidence`, `downloads`) import no
KMOS and have no side effects — data in, data out. They are the easy, fast-to-test
core. `platform`, `studio`, and `http` are where KMOS is touched.

---

## Prerequisites & setup

- Node **22+** (the app runs `.ts` directly via `--experimental-strip-types`).
- Run from the **repo root**. Knowledge Studio is a workspace; it depends on the
  `@kmos/*` packages by workspace protocol (`"*"` in `package.json`).

```bash
npm install            # from repo root
```

No database is required for development — with no `KMOS_DATABASE_URL` the platform
runs fully in-memory. Set `KMOS_DATABASE_URL` to a PostgreSQL instance for a
durable, restart-safe event log (read models rehydrate on boot; ADR-0011).

---

## Build, run, test, lint, fitness

Everything runs from the **repo root**.

```bash
npx tsc --build                      # solution-style build (references the KMOS
                                     #   packages Studio uses); emits dist/
npm run studio                       # start (offline via --experimental-strip-types
                                     #   + tools/dev/register.mjs) -> :8090

# 23 tests, run directly against the .ts sources:
node --experimental-strip-types --import ./tools/dev/register.mjs \
  --test products/knowledge-studio/test/*.test.ts

npx eslint products/knowledge-studio # lint
node tools/fitness-checks/run.mjs    # architectural fitness checks
```

The server listens on `PORT` (default `8090`). `index.ts` composes the platform,
builds the `StudioService`, and serves the UI at `/`, health at `/health`. It prints
which event log is backing it (in-memory vs PostgreSQL).

---

## How the pipeline works

`StudioService.submit(input)` registers a queued `Source` and kicks off processing
**in the background**, returning immediately so the UI can poll `getSource(id)` for
live progress. `submitAndProcess(input)` awaits the whole run (tests and CLI). Both
call `runPipeline`, which walks ten ordered stages (`studio.ts`). Each `StageState`
carries a `status` and a `mode` — one of `'kmos' | 'projection' | 'reference' |
'external'` — so the UI reports **honestly** how each step was fulfilled:

| # | Stage | Mode | What happens |
|---|-------|------|--------------|
| 1 | acquire | kmos / external | Resolve the source; obtain a transcript. YouTube without captions is `external` (needs yt-dlp) and fails honestly. |
| 2 | audio | external | Skipped when a transcript is supplied; ffmpeg decode in production. |
| 3 | transcribe | kmos | Register **source + transcript Assets** in KMOS, `recordDerivation` for lineage, parse into timestamped segments. |
| 4 | chapters | projection | `detectChapters` — outline from pauses/structure. |
| 5 | concepts | reference | KMOS **Language** `processTranscript` → Knowledge concepts (+ optional translation). |
| 6 | evidence | projection | `findEvidence` locates a grounding passage per concept. |
| 7 | relate | kmos | Record `RelatedTo` relationships from bounded segment co-occurrence. |
| 8 | trust | kmos | **Governance** `assessTrust` per concept (threshold `0.75`, evidence-decisive). |
| 9 | index | kmos | `search.rebuild()` so concepts are discoverable. |
| 10 | package | kmos | Assemble knowledge products; mark the source `ready`. |

The transcribe stage is the load-bearing one — it is where KMOS gains durable state:

```ts
const transcriptAsset = await this.p.assets.registerAsset({
  assetType: 'Document', mediaType: 'text/plain',
  displayName: `${source.title} — transcript`,
  organizationId: orgId,
  storageRef: { storageId: `${sourceId}/transcript`, backend: 'object' },
  checksum: sha256(transcriptText),
  content: new TextEncoder().encode(transcriptText),
  provenance: { origin: 'Ingested', originalSource: input.reference },
});
await this.p.assets.recordDerivation({
  derivedAssetId: transcriptAsset.id, inputAssetIds: [sourceAsset.id],
});
```

Trust is **evidence-decisive and honest**: only `knowledgeProvenance` varies with
whether a grounding passage exists. At threshold `0.75`, a grounded concept surfaces
as **Trusted** and an ungrounded one is marked **Needs review** — never a fabricated
claim (see the comment block around `assessTrust` in `studio.ts`).

---

## The read models

Two product types matter (`types.ts`):

- **`Source`** — the job + its outputs. `status`, ordered `stages`, `segments`,
  `chapters`, `conceptIds` (KMOS Concept ids), and asset ids. **Job state is
  app-local operational state; the knowledge it produced is durable in KMOS.**
- **`ConceptView`** — the heart of the product, assembled at **read time** by
  `conceptView(id)`. It pulls the concept, vocabulary, relationships, lineage, and
  trust **from KMOS**, then layers the `evidence` quotes as a projection:

```ts
const evidence = source ? findEvidence(source.segments, name, { maxQuotes: 3 }) : [];
const related  = this.relatedConcepts(id);          // KMOS graph projection
const lineage  = this.lineageFor(source);           // KMOS asset lineage
const trust    = this.trust.get(id) ?? { trusted: false, score: 0, reasons: [...] };
```

**Projections happen at read time in the pure modules.** Evidence quotes and chapters
are read-time projections over the transcript **Asset** (the concept's canonical
evidence ref) — grounding, never fabrication. `findEvidence` returns *nothing* for a
concept it cannot locate; the UI then marks it low-evidence rather than inventing a
quote. `assembleConceptViews(sourceId)` and `conceptSummaries(sourceId)` are the
aggregate views used by the Download Center and source outline.

---

## Adding a new HTTP endpoint

`http.ts` is a **thin transport** — parse the request, call one `StudioService`
method, serialize. Put **no business logic here**. Routes are matched on a split path
(`seg = path.split('/').filter(Boolean)`). Add a branch inside `handle`:

```ts
// GET /api/sources/:id/outline
if (seg[0] === 'api' && seg[1] === 'sources' && seg[3] === 'outline'
    && method === 'GET') {
  const id = seg[2]!;
  return studio.getSource(id)
    ? sendJson(res, 200, studio.conceptSummaries(id))
    : sendJson(res, 404, { error: 'Source not found' });
}
```

Use the existing `sendJson` / `sendHtml` / `readJson` helpers. If the endpoint needs
new behavior, add a **method to `StudioService`** and call it — never reach into KMOS
from the router. Keep responses consistent with the existing JSON shapes.

---

## Adding a new download artifact

Download renderers in `downloads.ts` are **pure**: they receive an already-assembled
`Source` (and `ConceptView[]`) and return text. They **never call KMOS**. Every
artifact must carry citations back to the source moment so downloaded knowledge stays
verifiable. Two steps:

1. Add a pure renderer in `downloads.ts`:

```ts
export function renderOutline(source: Source, concepts: readonly ConceptView[]): string {
  const out = [`# Outline — ${source.title}`, ''];
  for (const c of concepts) out.push(`- ${c.name} — ${c.trust.trusted ? 'trusted' : 'needs review'}`);
  return out.join('\n');
}
```

2. Register it in the `DOWNLOADS` map in `http.ts` (the key is the filename; it is
   served at `GET /api/sources/:id/download/<key>`):

```ts
'outline.md': { type: 'text/markdown; charset=utf-8',
  file: (id, s) => renderOutline(s.getSource(id)!, s.assembleConceptViews(id)) },
```

---

## Plugging in a real AI capability

All AI — transcription, extraction, translation — is **provider-independent**, behind
KMOS capability contracts. You do **not** call a model from this app.

For source acquisition, the seam is `CaptionFetcher` in `youtube.ts`:

```ts
export type CaptionFetcher = (videoId: string) => string | undefined;

export function resolveYouTube(url: string, fetcher?: CaptionFetcher): YouTubeResolution {
  const videoId = parseVideoId(url);
  if (!videoId) return {};
  const captions = fetcher ? fetcher(videoId) : undefined;   // honest: undefined offline
  return { videoId, /* ... */ ...(captions ? { captions } : {}) };
}
```

In production a `yt-dlp`/Whisper-backed **KMOS capability** supplies captions through
this adapter; offline it returns `undefined` and the user pastes a transcript — the
honest, verifiable path. The app never pretends to have fetched what it hasn't.

Concept extraction and translation already flow through the **KMOS Language domain**
(`this.p.language.processTranscript(...)`), which dispatches to a capability via the
capability registry + runtime. To swap the provider (Ollama, a hosted LLM, Whisper),
register a different capability implementation **in KMOS** — the app code does not
change. Keep this discipline: **AI stays behind capability contracts, never inline.**

---

## Testing approach

Two tiers, all 23 tests run directly against the `.ts` sources.

- **Pure-projection unit tests** (`transcript.test.ts`, `projections.test.ts`) — no
  KMOS, fast, deterministic. They pin projection behavior, including the honesty
  invariants: `findEvidence` returns `[]` for an absent concept, exact phrases outrank
  scattered words, and `resolveYouTube` yields no captions without a fetcher.
- **Full KMOS-backed integration** (`studio.test.ts`) — compose an in-memory platform
  with `createStudioPlatform()`, run the whole pipeline via `submitAndProcess`, and
  assert on the read models. These verify the end-to-end contract: every stage runs
  and reaches `ready`, concepts are evidence-grounded, a `ConceptView` is fully
  verifiable (evidence + lineage + trust), an ungrounded concept is honestly *not*
  trusted, and a bare YouTube URL fails with stage `mode === 'external'`.

```ts
const studio = new StudioService(createStudioPlatform());
const src = await studio.submitAndProcess({
  kind: 'transcript', reference: SAMPLE_TITLE, title: SAMPLE_TITLE,
  transcript: SAMPLE_TRANSCRIPT,
});
assert.equal(src.status, 'ready', src.error ?? '');
```

Prefer adding logic to a **pure module** so it can be unit-tested without KMOS; reach
for the integration tier only when the behavior genuinely depends on KMOS state.

---

## Coding conventions

- **ES modules with `.js` import specifiers**, even from `.ts` files
  (`import { parseTranscript } from './transcript.js'`). This is required.
- **Await everything.** No fire-and-forget event emits or unawaited KMOS calls. The
  one deliberate exception is `submit`'s background run, which is `void`-ed *and*
  guarded: `void this.runPipeline(...).catch((err) => this.failSource(...))`.
- `exactOptionalPropertyTypes` is **off**; still, prefer conditional spreads for
  optional fields (`...(x ? { x } : {})`) — the codebase uses this everywhere.
- **Zero runtime dependencies.** Only `node:*` builtins in `src/`. Do not add npm deps.
- `web.ts` (`STUDIO_HTML`) deliberately avoids backticks and `${}` so the SPA string
  nests safely — keep it that way when editing markup.
- Keep the router transport-only and renderers pure; new behavior goes on
  `StudioService`.

---

## Design invariants — a checklist

Before you merge, confirm your change keeps every one of these true:

- [ ] **No business logic or canonical objects in the app.** Concepts, assets,
      evidence, trust, relationships, collections stay in KMOS.
- [ ] **Never bypass KMOS.** Only public business APIs, on the one shared EventBus
      wired in `platform.ts`.
- [ ] **AI stays behind capability contracts.** No inline model calls; providers are
      swapped in KMOS, not here.
- [ ] **Projections never fabricate evidence.** No locatable passage ⇒ no quote.
- [ ] **Honesty in pipeline stage modes.** A stage that needs absent infra reports
      `external`; a projection reports `projection`; only real KMOS work is `kmos`.

If a change seems to require breaking one of these, it belongs in KMOS or in a new
capability — not in this layer. The kernel is frozen (ADR-0012); evolve the product.
