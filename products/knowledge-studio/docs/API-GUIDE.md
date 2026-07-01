# Knowledge Studio — HTTP API Guide

Knowledge Studio is the flagship KMOS ecosystem application: it turns a talk, a
lecture, or an upload into verifiable, navigable knowledge — concepts grounded in
exact transcript passages, explainable trust, chapters, relationships, and
downloadable knowledge products.

This document is the reference for the HTTP API exposed by `createStudioServer`
(`src/http.ts`). It is written for developers integrating with Knowledge Studio
over HTTP.

## Overview

- **Base URL:** `http://localhost:8090` (the server listens on `PORT`, default `8090`).
- **Transport:** Node's built-in `node:http` — zero runtime dependencies.
- **Content types:** all endpoints return `application/json; charset=utf-8`
  **except** `GET /` (returns `text/html`, the single-page UI) and the download
  endpoints (return `text/plain`, `text/markdown`, or `application/json` file
  attachments).
- **Request bodies:** `POST` endpoints accept a JSON body. A missing, empty, or
  malformed body is tolerated — it parses to `{}` and defaults are applied.

The HTTP layer is a **thin transport** over `StudioService` (`src/studio.ts`): it
parses the request, calls the application service, and serves the UI. **No
business logic lives in the HTTP layer.** Concepts, assets, evidence, lineage,
trust, relationships, and collections are all owned by KMOS; the service
assembles read models (evidence quotes, chapters) as projections over data KMOS
already holds.

## Canonical identifiers

- **Source ids** look like `src-1a2b3c4d` (an `src-` prefix plus a short UUID).
- **Concept ids** (and other KMOS object ids) are canonical KMOS identifiers of
  the form `kmos:Concept:<uuid>`, e.g. `kmos:Concept:6f1c2e0a-2b7d-4a11-9f3e-4c9a8b1d2e3f`.

---

## Endpoints

### `GET /health`

Liveness probe.

**Response — `200 OK`**

```json
{ "status": "ok", "sources": 3 }
```

`sources` is the number of sources currently registered in the service.

---

### `GET /`

Returns the Knowledge Studio single-page application as `text/html`. Not a JSON
endpoint.

**Response — `200 OK`** (HTML document)

---

### `GET /api/sample`

Returns a built-in sample title and transcript so a client can demonstrate the
full pipeline without sourcing its own content.

**Response — `200 OK`**

```json
{
  "title": "The Sample Talk",
  "transcript": "[00:00] Welcome. Today we cover institutional memory...\n[00:12] ..."
}
```

---

### `POST /api/sources`

Register a source and start processing. Returns immediately (`202 Accepted`);
processing runs in the background. Poll `GET /api/sources/:id` until
`status` is `ready` (or `failed`).

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `"youtube" \| "upload" \| "transcript"` | no (defaults to `"transcript"`) | Source type. |
| `reference` | `string` | no | YouTube URL or upload filename. Defaults to `title`, then `"Untitled"`. |
| `title` | `string` | no | Display title. Defaulted from the source if omitted. |
| `transcript` | `string` | no | Transcript text (timestamped or prose). |
| `targetLanguage` | `string` | no | A second language to translate concepts + transcript into. |

A **transcript is required to process a source** unless captions can be resolved
for it. Offline, supply `transcript` directly. A `youtube` source with no
transcript and no resolvable captions **fails honestly**: the `acquire` stage
fails with the message _"No transcript available. Paste a transcript (or
captions) to process this source."_ and the source ends in `status: "failed"`.

**Response — `202 Accepted`**

```json
{ "id": "src-1a2b3c4d", "status": "queued" }
```

**Example**

```bash
curl -s -X POST http://localhost:8090/api/sources \
  -H 'Content-Type: application/json' \
  -d '{"kind":"transcript","title":"The Sample Talk","transcript":"[00:00] Welcome..."}'
```

---

### `GET /api/sources`

List all sources as lightweight summaries, newest first.

**Response — `200 OK`** — array of:

```json
[
  {
    "id": "src-1a2b3c4d",
    "title": "The Sample Talk",
    "kind": "transcript",
    "status": "ready",
    "error": null,
    "conceptCount": 12,
    "chapterCount": 4,
    "durationSec": 1830,
    "createdAt": "2026-06-30T10:15:00.000Z",
    "stages": [
      { "id": "acquire", "status": "done" },
      { "id": "audio", "status": "skipped" },
      { "id": "transcribe", "status": "done" },
      { "id": "concepts", "status": "done" },
      { "id": "package", "status": "done" }
    ]
  }
]
```

`error` is `null` unless the source failed. `stages` here is the reduced
`{ id, status }` shape; the full stage objects are on the source detail endpoint.

---

### `GET /api/sources/:id`

Return the full `Source`.

**Response — `200 OK`**

```json
{
  "id": "src-1a2b3c4d",
  "kind": "transcript",
  "title": "The Sample Talk",
  "reference": "The Sample Talk",
  "targetLanguage": "fr",
  "status": "ready",
  "createdAt": "2026-06-30T10:15:00.000Z",
  "updatedAt": "2026-06-30T10:15:04.000Z",
  "stages": [
    {
      "id": "acquire", "label": "Acquire source", "status": "done",
      "mode": "kmos", "detail": "Transcript supplied directly.",
      "startedAt": "2026-06-30T10:15:00.000Z", "finishedAt": "2026-06-30T10:15:00.000Z"
    },
    {
      "id": "audio", "label": "Audio extraction", "status": "skipped",
      "mode": "external",
      "detail": "Skipped: transcript supplied. Audio extraction uses an ffmpeg capability when starting from raw media."
    }
  ],
  "segments": [
    { "index": 0, "startSec": 0, "endSec": 12, "text": "Welcome. Today we cover...", "timedExactly": true }
  ],
  "chapters": [
    { "id": "ch-1", "title": "Institutional memory", "startSec": 0, "endSec": 300, "segmentStart": 0, "segmentEnd": 24 }
  ],
  "correctedTranscript": "Welcome. Today we cover...",
  "translatedTranscript": "Bienvenue. Aujourd'hui...",
  "conceptIds": ["kmos:Concept:6f1c2e0a-2b7d-4a11-9f3e-4c9a8b1d2e3f"],
  "sourceAssetId": "kmos:Asset:2d0b...",
  "transcriptAssetId": "kmos:Asset:9a4e...",
  "durationSec": 1830
}
```

`status` is one of `queued`, `processing`, `ready`, `failed`. `error` is present
only on failure. `targetLanguage`, `correctedTranscript`, `translatedTranscript`,
`sourceAssetId`, and `transcriptAssetId` are optional and populated as the
pipeline runs. Each stage's `status` is one of `pending`, `running`, `done`,
`skipped`, `failed`; `mode` is one of `kmos`, `projection`, `reference`,
`external` (see [Pipeline stages](#pipeline-stages)).

**Response — `404 Not Found`**

```json
{ "error": "Source not found" }
```

---

### `GET /api/sources/:id/concepts`

Concept summaries for a source's outline, sorted by evidence count (descending),
then by name.

**Response — `200 OK`**

```json
[
  {
    "id": "kmos:Concept:6f1c2e0a-2b7d-4a11-9f3e-4c9a8b1d2e3f",
    "name": "Institutional memory",
    "definition": "The retained knowledge an organization preserves over time.",
    "evidenceCount": 3,
    "trusted": true,
    "startSec": 0
  }
]
```

`startSec` is present only when a grounding passage was found. Unknown sources
return `[]`.

---

### `GET /api/concepts/:id`

The fully-resolved `ConceptView` — the heart of the product. Assembled at read
time from KMOS (concept, vocabulary, relationships, lineage, trust) plus the
evidence-quote projection over the transcript.

**Response — `200 OK`**

```json
{
  "id": "kmos:Concept:6f1c2e0a-2b7d-4a11-9f3e-4c9a8b1d2e3f",
  "name": "Institutional memory",
  "definition": "The retained knowledge an organization preserves over time.",
  "sourceId": "src-1a2b3c4d",
  "sourceTitle": "The Sample Talk",
  "evidence": [
    {
      "quote": "Institutional memory is what an organization retains after the people change.",
      "startSec": 42, "endSec": 55, "segmentIndex": 3, "timedExactly": true
    }
  ],
  "related": [
    { "id": "kmos:Concept:aa11...", "name": "Knowledge preservation", "relation": "RelatedTo", "direction": "outgoing" }
  ],
  "lineage": [
    { "assetId": "kmos:Asset:9a4e...", "label": "The Sample Talk — transcript", "kind": "Document" },
    { "assetId": "kmos:Asset:2d0b...", "label": "The Sample Talk", "kind": "Media" }
  ],
  "trust": {
    "trusted": true,
    "score": 0.86,
    "reasons": ["Knowledge provenance grounded in a transcript passage.", "Policy compliant.", "Identity verified."]
  },
  "vocabulary": [
    { "language": "en", "term": "Institutional memory" },
    { "language": "fr", "term": "Mémoire institutionnelle" }
  ]
}
```

Up to 3 evidence quotes and 8 related concepts are returned. `related[].direction`
is `outgoing` when the queried concept is the relationship's source, `incoming`
otherwise. `lineage` is the chain of custody, derived asset first (the transcript)
then its ancestors (the source media).

**Response — `404 Not Found`**

```json
{ "error": "Concept not found" }
```

---

### `GET /api/search?q=QUERY`

Semantic search over concepts. Each hit is enriched with a supporting quote when
one is available. Up to 25 hits are returned. A query under 2 characters is not
meaningful and will not produce useful matches.

**Response — `200 OK`**

```json
[
  {
    "id": "kmos:Concept:6f1c2e0a-2b7d-4a11-9f3e-4c9a8b1d2e3f",
    "name": "Institutional memory",
    "score": 0.91,
    "quote": "Institutional memory is what an organization retains after the people change.",
    "startSec": 42,
    "sourceId": "src-1a2b3c4d"
  }
]
```

`quote` and `startSec` are present only when a supporting passage was found.

**Example**

```bash
curl -s 'http://localhost:8090/api/search?q=institutional%20memory'
```

---

### `POST /api/collections`

Create a KMOS Collection grouping concepts.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | no (defaults to `"Collection"`) | Collection name. |
| `memberIds` | `string[]` | no (defaults to `[]`) | Concept ids to include. |

**Response — `201 Created`**

```json
{
  "id": "kmos:Collection:7c3f...",
  "name": "Onboarding essentials",
  "memberIds": ["kmos:Concept:6f1c2e0a-2b7d-4a11-9f3e-4c9a8b1d2e3f"]
}
```

---

### `GET /api/sources/:id/download/:artifact`

Download a knowledge product for a source as a file attachment. The response
carries `Content-Disposition: attachment; filename="<sourceId>-<artifact>"`.

| `:artifact` | Content-Type | Contents |
|---|---|---|
| `transcript.txt` | `text/plain` | Plain, timecoded transcript. |
| `transcript.md` | `text/markdown` | Transcript as Markdown, organized under detected chapters. |
| `study-notes.md` | `text/markdown` | Each concept: definition, strongest cited quote, and trust verdict. |
| `concepts.json` | `application/json` | Machine-readable concept export (concepts + evidence + related + trust). |
| `package.json` | `application/json` | Full bundle: source metadata, chapters, segments, concepts, evidence, lineage, vocabulary. |

Every rendered artifact carries citations back to the source moment, so
downloaded knowledge stays verifiable outside the app.

**Response — `200 OK`** — file body.

**Response — `404 Not Found`** — unknown source **or** unknown artifact:

```json
{ "error": "Not found" }
```

---

### Unknown routes and errors

Any unmatched route returns `404`:

```json
{ "error": "No route for GET /api/nope" }
```

An unhandled exception returns `500` with the error message:

```json
{ "error": "..." }
```

---

## Pipeline stages

Processing runs as ten ordered stages, surfaced on the source's `stages` array so
a client can render live progress. Each stage carries a `mode` tag stating
**honestly how it was fulfilled**:

| `mode` | Meaning |
|---|---|
| `kmos` | A real KMOS operation ran (e.g. registering assets, recording relationships, assessing trust, indexing). |
| `projection` | A read-time projection over KMOS data (e.g. chapter detection, evidence grounding). |
| `reference` | A deterministic reference capability stood in for infra-dependent AI (e.g. concept extraction offline; an Ollama/hosted LLM runs in production). |
| `external` | Needs external infrastructure not present — `yt-dlp`, `ffmpeg`, or Whisper — and is reported honestly (e.g. YouTube download, audio extraction). |

The stages, in order: `acquire`, `audio`, `transcribe`, `chapters`, `concepts`,
`evidence`, `relate`, `trust`, `index`, `package`. When a transcript is supplied,
`audio` is honestly `skipped` (mode `external`) — no fake audio work is claimed.

## Evidence and trust are honest by construction

- **Evidence quotes are real transcript passages.** Each `quote` is the exact
  passage from the source transcript that grounds a concept, projected over the
  KMOS transcript Asset. Quotes are **never fabricated**. `timedExactly` tells you
  whether the moment came from source timing (`true`) or was estimated (`false`).
- **Trust is explainable, never a bare score.** Every `TrustView` carries
  `reasons`. A concept grounded in a real transcript passage clears the threshold
  and surfaces as **trusted**; an ungrounded concept is honestly marked as
  **needs review** rather than making a fabricated claim of trust.

## Typical flow

```bash
BASE=http://localhost:8090

# 1) Grab the built-in sample content.
curl -s "$BASE/api/sample"

# 2) Submit it as a source (returns 202 immediately).
ID=$(curl -s -X POST "$BASE/api/sources" \
  -H 'Content-Type: application/json' \
  -d '{"kind":"transcript","title":"The Sample Talk","transcript":"[00:00] Welcome..."}' \
  | sed -E 's/.*"id":"([^"]+)".*/\1/')

# 3) Poll until processing finishes (status: "ready" or "failed").
until curl -s "$BASE/api/sources/$ID" | grep -q '"status":"ready"'; do sleep 1; done

# 4) Read the concept outline for the source.
curl -s "$BASE/api/sources/$ID/concepts"

# 5) Open a single concept with evidence, relationships, lineage, and trust.
curl -s "$BASE/api/concepts/kmos:Concept:6f1c2e0a-2b7d-4a11-9f3e-4c9a8b1d2e3f"

# 6) Search across concepts.
curl -s "$BASE/api/search?q=institutional%20memory"

# 7) Download a knowledge product.
curl -s -OJ "$BASE/api/sources/$ID/download/study-notes.md"
```
