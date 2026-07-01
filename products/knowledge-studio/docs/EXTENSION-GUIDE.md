# Knowledge Studio — Extension Guide

Knowledge Studio is deliberately built so it can grow for years **without redesign**. This
guide gives step-by-step recipes for the extensions we expect first. Every recipe holds the
same discipline: **extend KMOS, don't bypass it; keep AI behind capability contracts; never
fabricate evidence.** See [ARCHITECTURE.md](ARCHITECTURE.md) for the design invariants and
[DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md) for conventions.

## 1. Plug in a real AI capability (transcription, extraction, translation)

The offline build uses deterministic **reference capabilities** so everything runs with no
external services. Production simply registers a real implementation against the **same
KMOS capability contract** — the app does not change, because it never talks to a model
directly.

1. Implement the capability behind its KMOS contract (e.g. a Whisper/Speaches transcription
   capability, or an Ollama/hosted-LLM knowledge-extraction capability). Provider choice is
   an implementation detail; the contract (inputs/outputs/objects/events) stays fixed.
2. Register the implementation in the Capability Registry + Runtime during composition (see
   how the Language domain registers its capabilities in `domains/language`).
3. Nothing in `studio.ts` changes: the pipeline still calls `language.processTranscript`;
   richer concepts flow through automatically.

**Provider independence is the point** — you can swap models per environment (local for
dev, hosted for scale) with zero product code changes.

## 2. Fetch YouTube captions / audio (the `CaptionFetcher` seam)

`youtube.ts` exposes a `CaptionFetcher` seam so a production adapter can supply captions:

```ts
export type CaptionFetcher = (videoId: string) => string | undefined;
```

Provide a yt-dlp/caption-API-backed fetcher (ideally itself a KMOS media capability), inject
it where `resolveYouTube` is called, and the *acquire* stage will report `mode: 'kmos'`
instead of `external`. Until then the app is honest: it tells the user to paste the
transcript rather than pretending it downloaded one.

## 3. Add a new content type (PDF, podcast, paper, meeting…)

"Source" is one abstraction; a lecture is just the first kind. To add another:

1. Add the `SourceKind` and an **acquire** path that yields text (a PDF text-extraction or
   podcast-transcription **capability** — behind a contract, of course).
2. That's it for the core: **chapters → concepts → evidence → relate → trust → index** and
   every read model are already source-agnostic. Register the source + derived-text Assets
   exactly as the transcript path does, so lineage stays real.
3. Tune only what's genuinely different (e.g. a paper's section segmenter can replace the
   pause-based chapterizer).

## 4. Add a new output (flashcards, quiz, mind map, citation package…)

Outputs are **renderers over verifiable knowledge you already have** (`ConceptView` /
`Source`). To add one:

1. Add a pure renderer in `downloads.ts` (or a new module) taking the assembled data.
2. Register it in the `DOWNLOADS` map in `http.ts` (type + filename), or add a dedicated
   endpoint.
3. Surface it in the Download Center in `web.ts`.

Because every concept carries its evidence and trust, generated study artifacts are
**citable by construction** — a flashcard can link to the exact moment, a citation package
can prove provenance.

## 5. Add a new HTTP endpoint

Add a `StudioService` method that composes KMOS/read models, then a thin route in `http.ts`
that calls it and serializes JSON. Keep all logic in the service; the transport stays dumb.

## What NOT to do

- Don't mint or mutate canonical objects in the app — call a KMOS service.
- Don't call an AI model directly from the app — go through a capability contract.
- Don't generate an "evidence" quote — locate it in the source, or show none.
- Don't add a global force-directed knowledge graph — exploration stays focused and *from
  where you are*.
- Don't touch the frozen kernel (ADR-0012); if real product need exposes a platform gap,
  raise it through the governed KMOS process.
