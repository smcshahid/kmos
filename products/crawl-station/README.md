# CrawlStation

**The acquisition front-end for the KMOS ecosystem. This is where knowledge enters KMOS.**

Point CrawlStation at a website, press **Acquire**, and watch a transparent, polite crawl
turn the open web into *trustworthy, structured knowledge* — every page preserved as
verifiable evidence with a content hash and provenance, readable content derived with
full lineage, each page a searchable `KnowledgeObject` with explainable trust. All of it
durable in KMOS.

CrawlStation is the KMOS ecosystem's flagship #003 (after Knowledge Studio and Podcast
Studio) and the first application built entirely under the **Product Era** (ADR-0018): it
is a *thin* product over the frozen KMOS platform substrate — **no new platform
capabilities, no kernel changes**.

---

## Why it feels different

- **Never a black box.** You always see what was discovered, queued, acquired, skipped,
  excluded by robots.txt, redirected, or failed — with a live activity feed and per-page
  detail.
- **Evidence-first.** Every fetched page's raw bytes are hashed (sha-256) and preserved as
  a KMOS `Asset` before anything else. Readable content is a *derived* asset with recorded
  lineage — a real chain of custody.
- **Trust you can read.** Each page gets an explainable trust assessment (not a bare
  score). A thin or unreadable page is honestly marked *needs review*, never over-trusted.
- **Polite by default.** robots.txt is honored (allow/disallow precedence, `*`/`$`,
  crawl-delay) and requests are spaced per host. CrawlStation identifies itself honestly.
- **Calm, fast, keyboard-friendly UI** with light/dark themes, accessible landmarks, and
  live telemetry — its own personality, zero build step, zero runtime dependencies.

## The core workflow

```
Enter URL → Preview settings → Acquire → Observe (live) → Review pages → Search → Done
```

A first-time user understands it in under a minute: paste `https://example.com`, click
**Try a sample** if you want, press **Acquire**.

## Quick start

```bash
# From the monorepo root:
npm run crawl                       # serves on http://localhost:8092 (in-memory)

# Durable across restarts (shares the KMOS PostgreSQL event log):
KMOS_DATABASE_URL=postgres://kmos:kmos@localhost:5432/kmos npm run crawl
```

Open <http://localhost:8092>, paste a URL, press **Acquire**. Health check at `/health`.

### Docker

```bash
docker build -f products/crawl-station/Dockerfile -t crawl-station .
docker run -p 8092:8092 crawl-station          # give the container network egress
```

See [docs/DEPLOYMENT-GUIDE.md](docs/DEPLOYMENT-GUIDE.md) for Olares and shared-database
deployment, and [docs/OPERATIONS-GUIDE.md](docs/OPERATIONS-GUIDE.md) for day-2 operations.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `8092` | HTTP port for the UI + API. |
| `KMOS_DATABASE_URL` | *(unset)* | PostgreSQL URL. Set → durable canonical event log + crawl state (restart-safe). Unset → in-memory. |
| `KMOS_ENFORCE` | `false` | Require an actor on every canonical write (attribution enforcement). |
| `CS_USER_AGENT` | `CrawlStation/1.0 (+…; respects robots.txt)` | User-agent presented to sites and robots.txt. |

Per-crawl settings (max depth, max pages, politeness, concurrency, same-site, respect
robots) are chosen in the UI or the `POST /api/crawls` body — see the API below.

## Phase 1 scope

**In:** website acquisition, recursive depth-bounded crawl, robots.txt, rate limiting,
retry, redirect handling, duplicate detection, canonical-URL handling, content + metadata
extraction, basic media (image) discovery, knowledge persistence, live crawl progress,
search, crawl history, statistics, and settings.

**Deliberately out (future phases, only if a product justifies them):** enterprise
connectors (SharePoint/Confluence/Notion/GitHub), email/cloud/API/feed ingestion,
scheduling beyond Phase 1 needs, AI agents, workflow engines, and any generic acquisition
framework or speculative SDK.

## HTTP API

| Method + path | Purpose |
|---|---|
| `GET /` | Single-page UI |
| `GET /health` | `{ status, crawls }` |
| `GET /api/dashboard` | Aggregate knowledge stats |
| `GET /api/sample` | A safe sample seed URL |
| `POST /api/crawls` | Start a crawl: `{ seedUrl, config? }` → `202 { id, status }` |
| `GET /api/crawls` | Crawl summaries (history) |
| `GET /api/crawls/:id` | Full job: stats, live activity, page rows |
| `POST /api/crawls/:id/cancel` | Cooperatively stop an in-flight crawl |
| `POST /api/crawls/:id/retry` | Re-crawl (fresh) reusing seed + config |
| `POST /api/crawls/:id/favorite` | Toggle favorite |
| `GET /api/crawls/:id/pages/:pageId` | Full verifiable page view (metadata, lineage, trust, excerpt) |
| `GET /api/crawls/:id/export.json` | Portable knowledge package (every page cites its source) |
| `GET /api/search?q=` | Meaning-based search across acquired pages |

`config` fields: `maxDepth` (0–5), `maxPages` (1–500), `sameSiteOnly`, `respectRobots`,
`politenessMs` (0–10000), `concurrency` (1–16), `timeoutMs`, `maxRetries`.

## Architecture in one paragraph

CrawlStation composes the KMOS platform substrate through `@kmos/sdk` and adds a thin
application service that drives a KMOS-unaware crawl engine. For each fetched page it
preserves the raw HTML as an `Asset` (evidence), derives readable content as a second
`Asset` with recorded lineage, creates a `KnowledgeObject` (a Topic), records the
discovery path as a knowledge relationship, assesses explainable trust via Governance, and
indexes it for search. Business logic lives in the platform + the product's own pure
modules; the app orchestrates and presents. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Tests

```bash
npm run test -w @kmos/crawl-station-app
```

Fully offline and deterministic (injected `fetch`, no network): URL rules, robots.txt,
HTML extraction, the crawl frontier (depth/scope/robots/dedup/redirects), and an
end-to-end crawl through the real KMOS platform producing evidence, lineage, knowledge,
relationships, trust, and search — plus durable job-state recovery.
