# Knowledge Studio — Architecture

## Principle: a thin product layer over KMOS

Knowledge Studio adds **orchestration and user experience only**. It contains **no
business logic and owns no canonical objects** (KMOS-9999 §9); it never bypasses the
platform; and it leaves the **frozen kernel** (ADR-0012) untouched. Concepts, assets,
evidence, lineage, trust, relationships, collections, and the event history are all KMOS
facts. The application composes the KMOS services it needs, drives them through their
public business APIs, and assembles **read models** for a calm, verifiable UI.

```
                    ┌──────────────────────────── Browser (SPA, web.ts) ───────────────────────────┐
                    │  compose · watch pipeline · explore concepts · verify evidence · search · DL   │
                    └───────────────────────────────────────┬───────────────────────────────────────┘
                                                             │  HTTP/JSON (http.ts, node:http)
                    ┌────────────────────────────────────────▼──────────────────────────────────────┐
                    │                         StudioService  (studio.ts)                              │
                    │   submit → runPipeline (visible stages) · conceptView · search · collections    │
                    │   pure projections:  transcript.ts · chapters.ts · evidence.ts · downloads.ts   │
                    └───┬──────────┬───────────┬────────────┬───────────┬───────────┬────────────┬────┘
                        │          │           │            │           │           │            │
                     Identity   Assets      Language     Knowledge   Governance   Search       Events
                     (attrib.) (lineage/   (Workflow +   (concepts/  (explainable (semantic   (durable,
                               integrity)  Capabilities) relations/  trust)       index)      replayable)
                                            → concepts   collections)
                    └────────────────────────────── KMOS platform (one shared EventBus) ─────────────┘
                                                             │
                                              in-memory  |  PostgreSQL EventLog (durable)
```

## Module map (`src/`)

| Module | Responsibility | Touches KMOS? |
|---|---|---|
| `platform.ts` | Composition root: wires the KMOS services on one bus. `createStudioPlatform` (in-memory) / `createStudioPlatformFromEnv` (durable Postgres + hydrate + search rebuild). | wires it |
| `studio.ts` | `StudioService` — the orchestrator. Runs the pipeline, assembles read models. | drives it |
| `transcript.ts` | Pure: parse raw transcript → timestamped segments (VTT / leading-timestamp / estimated prose). | no |
| `chapters.ts` | Pure: segment → chapter outline (pauses + even fallback). | no |
| `evidence.ts` | Pure: locate a concept's supporting passages in the transcript. | no |
| `youtube.ts` | Pure: parse video id; `CaptionFetcher` seam for a production yt-dlp/Whisper adapter. | no |
| `downloads.ts` | Pure: render transcript / study-notes / concepts / package artifacts. | no |
| `http.ts` | `createStudioServer` — node:http transport over `StudioService`. | no |
| `web.ts` | `STUDIO_HTML` — self-contained accessible SPA (inline CSS/JS, zero build). | no |
| `sample.ts` / `types.ts` / `index.ts` | Bundled sample · product read-model types · entry + exports. | no |

The four pure modules have no KMOS dependency and no side effects, so they are exhaustively
unit-tested in isolation; `studio.ts` is covered by full KMOS-backed integration tests.

## The pipeline (visible, honest)

`StudioService.runPipeline` executes ordered stages; each updates a `StageState`
(`status` + `mode`) that the UI renders live. `mode` is the honesty contract:

- **`kmos`** — a real KMOS operation ran (asset registration, concept creation, trust).
- **`projection`** — a read-time projection over KMOS data (chapters, evidence quotes).
- **`reference`** — a deterministic KMOS *reference* capability stood in for infra-
  dependent AI (offline concept extraction / translation).
- **`external`** — needs external infrastructure not present (yt-dlp / Whisper / ffmpeg);
  reported plainly, never faked.

| Stage | What happens | KMOS |
|---|---|---|
| acquire | Resolve source; obtain transcript (paste/captions). YouTube w/o transcript fails honestly. | — |
| audio | Skipped when a transcript is supplied (ffmpeg capability in production). | external |
| transcribe | Register **source** + **transcript** Assets; `recordDerivation` links them (real lineage); parse into timestamped segments. | Assets |
| chapters | Detect a chapter outline from the segments. | projection |
| concepts | `language.processTranscript` → **Concepts** in Knowledge (+ optional translation). | Language→Knowledge |
| evidence | Confirm each concept is locatable in the transcript (grounding, not fabrication). | projection |
| relate | Record `RelatedTo` **relationships** from bounded segment co-occurrence. | Knowledge |
| trust | `governance.assessTrust` per concept — explainable, evidence-decisive. | Governance |
| index | `search.rebuild` so concepts are semantically discoverable. | Search |
| package | Finalize; source becomes `ready`. | — |

## Read models — verifiable by construction

- **`ConceptView`** (the heart) is assembled at read time from KMOS (`getKnowledge`,
  `getVocabulary`, relationships via the graph projection, `getLineage`, cached trust) plus
  the **evidence-quote projection** over the transcript. Evidence quotes are *located*, not
  *generated*: `findEvidence` searches the actual transcript segments for the concept's
  term and returns the exact passage with its timestamp. A concept with no locatable
  passage returns **no evidence** and is honestly marked *needs review* — the app never
  invents a quote.
- **Lineage** is genuine KMOS asset lineage: `getLineage(transcriptAssetId)` yields the
  transcript ← source-media chain of custody.
- **Trust** is `governance.assessTrust` with **evidence-decisive, honest** inputs:
  identity + policy clear the mandatory gate; `knowledgeProvenance` reflects a real
  grounding passage; `reviewerApproval` is `false` (nothing is human-reviewed yet). At
  threshold `0.75`, a grounded concept (6/7 ≈ 0.86) surfaces as **Trusted** while an
  ungrounded one (5/7 ≈ 0.71) is **Needs review** — with the full reason list shown.

### Where projections are legitimate (and where they aren't)

Evidence quotes and chapters are **presentation projections** over data KMOS already holds
(the transcript Asset that is the concept's evidence ref). They surface *where* an idea
appears; they create no new business truth. The **truth** — that a concept exists, is owned
and versioned, derives from this transcript, relates to those concepts, and carries this
trust — lives entirely in KMOS. The dividing line the app must never cross: no canonical
object is minted, mutated, or judged outside a KMOS service.

## Durability

With `KMOS_DATABASE_URL` set, the canonical EventLog is PostgreSQL-backed; on boot the
events DDL runs, every service read model rehydrates from the durable log (ADR-0011), and
the search index rebuilds — a restarted Studio serves identical knowledge, lineage, and
trust. The app's per-source **job state** (pipeline status, parsed segments used for the
evidence projection, chapter layout) is currently in-memory in the Studio process; the
canonical knowledge persists, while a source's live transcript/segment view is rebuilt on
re-process. Job-state persistence is a tracked roadmap item; run a single replica until it
lands. (See OPERATIONS-GUIDE.)

## Extension seams (no dead ends)

- **Provider-independent AI.** Transcription, extraction, and translation are KMOS
  **capabilities behind contracts**. To use a real model (Whisper/Ollama/hosted), register
  an implementation against the same capability contract — no app change. The
  `CaptionFetcher` seam in `youtube.ts` is where a yt-dlp/caption adapter injects.
- **New content types.** "Source" is one abstraction. A PDF/podcast/paper needs only its
  own acquire + (optional) transcription capability; the rest of the pipeline (concepts →
  evidence → relate → trust → index) and every read model are already source-agnostic.
- **New outputs.** Flashcards, quizzes, mind maps, citation packages are new renderers over
  `ConceptView`/`Source` (add to `downloads.ts` + an endpoint) — the verifiable knowledge
  is already there.
- **New endpoints.** Add a route in `http.ts` that calls a `StudioService` method; keep the
  transport thin.

See [EXTENSION-GUIDE.md](EXTENSION-GUIDE.md) for step-by-step recipes and
[DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) for conventions.

## Design invariants (the discipline)

1. No business logic or canonical objects in the app; KMOS owns truth.
2. Never bypass KMOS; drive it through public business APIs only.
3. AI stays behind capability contracts; no coupling to one provider.
4. Projections **surface** evidence; they never **fabricate** it.
5. Pipeline stage `mode` tags are honest about what actually ran.
6. The kernel is frozen (ADR-0012); the app drives platform evolution only by revealing
   real needs through the governed process.
