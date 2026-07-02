# CrawlStation — Architecture

CrawlStation is a **thin product over the KMOS platform substrate**. It contains no
business logic that belongs in the platform and invents no canonical objects or events
(KMOS-9999 §7/§8/§9). It composes the substrate, drives a self-contained crawl engine, and
maps the web onto canonical KMOS operations.

## Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│  UI (web.ts) — single-page, zero-build, accessible, live telemetry     │
├──────────────────────────────────────────────────────────────────────┤
│  HTTP (http.ts) — node:http transport; parse → call service → respond  │
├──────────────────────────────────────────────────────────────────────┤
│  CrawlService (crawl-service.ts) — orchestration + read models         │
│    drives the engine; maps each page onto KMOS; assembles views        │
├───────────────────────────────┬──────────────────────────────────────┤
│  Crawl engine (KMOS-unaware)   │  KMOS platform substrate (@kmos/sdk)  │
│    crawler.ts  frontier        │    identity · assets · knowledge      │
│    extract.ts  readability     │    governance · search · events       │
│    robots.ts   politeness      │    (one canonical event bus, durable  │
│    urls.ts     identity/scope  │     PostgreSQL or in-memory EventLog)  │
├───────────────────────────────┴──────────────────────────────────────┤
│  crawl-store.ts — durable job-state (JSONB) over the shared SqlClient   │
└──────────────────────────────────────────────────────────────────────┘
```

The composition root (`platform.ts`) returns the bare `PlatformRuntime` from `@kmos/sdk`.
Unlike Knowledge Studio and Podcast Studio, CrawlStation adds **no domains** — every web
concept maps directly onto platform primitives, so it is the cleanest KMOS product.

## The web → KMOS mapping (the heart)

For each successfully fetched page, `CrawlService.storePage` performs, in order:

1. **Raw HTML → `Asset`** (Document, `text/html`) with the response's **sha-256** as the
   integrity checksum and provenance `origin=Ingested, originalSource=<url>`.
   *Evidence before Files.*
2. **Readable content → derived `Asset`** (Document, `text/plain`), then
   `recordDerivation(derived ← raw)`. *Lineage / chain of custody.*
3. **The page → `KnowledgeObject`** (category `Topic`): `canonicalName` = title,
   `definition` = description/excerpt, `evidenceRefs` = [content, raw], `confidence` =
   extraction confidence. *Knowledge before Applications.*
4. **Discovery path → relationship** `References` (parent page → this page) when the
   parent is known. *The graph of how knowledge was reached.*
5. **Trust → `Governance.assessTrust`** with evidence booleans (integrity hash present,
   real readable content, robots-compliant fetch, organizational attribution, clean
   extraction; human review = false). Explainable reasons, decisive threshold. *Trust
   before Optimization.*
6. **Search** — the `KnowledgeObject` is indexed; `SearchService.rebuild()` runs once when
   the crawl completes.

Nothing here is app-invented canonical truth: assets, lineage, knowledge, relationships,
and trust all live in KMOS and rehydrate from the durable event log on boot.

## Job state vs. canonical truth

The **crawl job** (status, stats, per-page rows with their KMOS ids, the recent activity
feed) is *app-owned operational state* — exactly analogous to Knowledge Studio's `Source`.
It is persisted as one JSONB row per crawl through the shared `SqlClient` port
(`crawl-store.ts`) and recovered on boot. A crawl interrupted by a restart is honestly
marked *failed-and-retryable*, never left "crawling". The canonical knowledge it produced
is durable independently in the event log.

## The crawl engine (pure, offline-testable)

`crawler.ts` is a polite, depth-bounded breadth-first frontier that knows nothing about
KMOS. It:

- discovers links, dedups by **canonical URL** (`urls.ts`: fragment/tracking-param/default-
  port normalization, www-insensitive same-site scope, non-page asset filtering),
- honors **robots.txt** (`robots.ts`: user-agent group selection, longest-match
  allow/disallow precedence, `*` wildcards, `$` anchors, crawl-delay, sitemaps),
- spaces requests **per host** (politeness gate reserved synchronously to serialize
  concurrent workers),
- **retries** transient failures (network / 429 / 5xx) with linear backoff and follows
  **redirects manually** (up to 5 hops) so they are observable,
- **extracts** readable content + metadata + links + images (`extract.ts`: drops
  script/style/boilerplate, prefers `<article>`/`<main>`, decodes entities, computes a
  transparent confidence score),
- emits structured `CrawlEvent`s (`discovered` / `fetched` / `excluded` / `skipped` /
  `error`) and hands each fetched page to the service via an awaited callback.

The only I/O is an **injected `fetch`** (defaults to global `fetch`), so the entire product
is tested deterministically offline — and, in CI, against a real local socket end-to-end.

## Why the engine is *in* the product

Business logic belongs in capabilities, not applications (KMOS-9999 §9) — but CrawlStation
is KMOS's *first* web-acquisition app. Per the evidence-first mandate (ADR-0013/0015), the
crawl frontier, extraction, and URL/robots rules stay local pure modules until a **second**
consumer proves the need to promote them to a shared `@kmos/web-acquisition` capability.
That promotion trigger is recorded in `documentation/CAPABILITY-EVOLUTION-ROADMAP.md`. This
mirrors how Knowledge Studio's `youtube.ts`/`downloads.ts` began local before shared
content-projections were extracted once Podcast Studio proved a second consumer.

## Module map

| File | Responsibility |
|---|---|
| `platform.ts` | Compose the KMOS substrate via `@kmos/sdk` (in-memory or durable-from-env). |
| `crawl-service.ts` | Orchestrate crawls; map pages onto KMOS; assemble read models (page view, summaries, search, dashboard). |
| `crawl-store.ts` | Durable job-state (JSONB) over the shared `SqlClient` port. |
| `crawler.ts` | KMOS-unaware BFS frontier: fetch, politeness, retry, redirect, dedup, extract. |
| `extract.ts` | Pure HTML → title/description/canonical/lang/text/links/images/confidence. |
| `robots.ts` | Pure robots.txt parse + longest-match allow/disallow decision. |
| `urls.ts` | Pure URL canonicalization, same-site scope, page/asset classification. |
| `http.ts` | `node:http` transport + JSON API + knowledge-package export. |
| `web.ts` | Single-page UI (inline CSS + vanilla JS, light/dark, accessible). |
| `types.ts` | Product read models + job state (no business logic). |
| `index.ts` | Entry: compose → build service → serve. |

## Extending CrawlStation

- **Richer extraction** (e.g. main-content scoring, boilerplate ML): evolve `extract.ts`;
  it is pure and unit-tested.
- **New acquisition sources** (feeds, sitemaps as seeds): add product-local modules; only
  promote to a capability when a second app needs the same behavior.
- **AI summaries per page**: inject a provider-independent capability (`@kmos/providers`)
  at `index.ts` and enrich the `KnowledgeObject` definition — provider-unaware, config-
  driven (ESRI-01 / ADR-0016), with honest offline degradation. Not part of Phase 1.

Keep the platform frozen: anything CrawlStation needs that does not exist is built as
application-tier code and only extracted on real second-consumer evidence (Future Platform
Rule, ADR-0018 / Ecosystem Constitution Article XI).
