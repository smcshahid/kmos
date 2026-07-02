# CrawlStation — Operations Guide

Day-2 operations for running CrawlStation reliably and politely.

## Running

- **Start:** `npm run crawl` (root) or `npm run start -w @kmos/crawl-station-app`.
- **Port:** `PORT` (default 8092). **Health:** `GET /health` → `{ status: "ok", crawls: N }`
  (use for liveness/readiness).
- **Backing:** set `KMOS_DATABASE_URL` for durable, restart-safe operation; otherwise
  in-memory (all crawls lost on restart). On boot with a database, CrawlStation rehydrates
  KMOS read models from the event log and reloads every crawl from `cs_crawls`.

## Being a good web citizen

- **robots.txt is honored by default** (`respectRobots`). Leave it on unless you own the
  target and have a reason not to. Crawl-delay from robots.txt is respected.
- **Politeness:** `politenessMs` (default 400) spaces requests per host; `concurrency`
  (default 4) bounds parallelism across hosts. Lower these for fragile targets.
- **Scope:** `sameSiteOnly` (default on) keeps the crawl on the seed's site; off-site
  links are simply not followed. `maxDepth` (default 2) and `maxPages` (default 40) bound
  the run — raise deliberately.
- **Identity:** set `CS_USER_AGENT` to something that identifies you and offers a contact,
  so site operators can reach you.

## Observing a crawl

The crawl view shows live telemetry (discovered / queued / acquired / skipped / excluded /
errors / redirects / bytes) and an activity feed. Programmatically, poll
`GET /api/crawls/:id` — `stats`, `activity` (most recent first), and per-page rows update
as the crawl proceeds. Stop a runaway crawl with `POST /api/crawls/:id/cancel`
(cooperative; in-flight fetches finish).

## Reading trust honestly

Each acquired page carries an explainable trust assessment. A page is *Trusted* when its
bytes were integrity-hashed and preserved, it was fetched in compliance with robots.txt,
it is attributed to an organization, and substantial readable content was cleanly
extracted. A thin page (little readable text) or a poor extraction is marked **Needs
review** — this is by design; CrawlStation never fabricates confidence. Inspect the reasons
in the page drawer (`GET /api/crawls/:id/pages/:pageId`).

## Verifying provenance

Every page view exposes: the original + canonical URL, HTTP status, any redirect target,
the **sha-256** content hash, extraction confidence, crawl depth, the page it was
discovered from, and a **lineage** chain (readable content ← raw HTML evidence). Export a
portable, fully-cited knowledge package with `GET /api/crawls/:id/export.json`.

## Troubleshooting

| Symptom | Likely cause / action |
|---|---|
| Crawl finishes with 0 pages acquired | Target unreachable, non-HTML, or blocked by robots.txt — check the activity feed for `excluded`/`error`/`skipped` reasons. Confirm container egress. |
| Everything "Needs review" | Pages are thin or JS-rendered (CrawlStation reads server HTML, not client-rendered DOM). Expected for SPA shells. |
| Crawl stuck at "queued/crawling" after a restart | With no database, state is ephemeral. With a database, interrupted crawls are auto-marked **failed** on boot — use **Re-crawl**. |
| Slow crawls | Increase `concurrency` / lower `politenessMs` for robust targets; but stay polite. |
| Duplicate-looking pages | They are deduped by canonical URL (tracking params, fragments, default ports, trailing slashes normalized). Genuinely distinct query params are kept. |
| `EADDRINUSE` | Another process holds `PORT`; choose a free port. |

## Backup & recovery

Acquired knowledge lives in the shared KMOS event log; crawl job-state is the JSONB table
`cs_crawls` in the same PostgreSQL. `pg_dump` the database to back up both. On restart,
KMOS read models and all crawls rebuild automatically (ADR-0011) — a restored database
yields an identical experience.

## Security notes

- Treat acquired content as untrusted input; it is stored as evidence, never executed.
- CrawlStation fetches arbitrary user-supplied URLs. In sensitive networks, restrict egress
  (e.g. deny RFC 1918 ranges) to avoid SSRF-style reach into internal services.
- Enable `KMOS_ENFORCE=true` to require attribution on every canonical write.
