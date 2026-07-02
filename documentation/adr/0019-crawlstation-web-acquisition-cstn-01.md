# ADR 0019 — CrawlStation: the web-acquisition front-end (CSTN-01)

## Status

**Accepted (executed)** — the first application built entirely under the Product Era
(ADR-0018) and its Future Platform Rule. Built, tested, containerized, and packaged for
Olares against the frozen KMOS substrate with **zero platform changes and zero new
platform capabilities**. Consistent with the application-driven evolution line
(ADR-0012 … ADR-0018) and the [Ecosystem Constitution](../ecosystem/ECOSYSTEM-CONSTITUTION.md).

## Context

The KMOS ecosystem had two flagships (Knowledge Studio, Podcast Studio), both of which
*process* knowledge that already exists as media. Neither *acquires* knowledge from the
open web. CrawlStation fills that gap: it is the ecosystem's acquisition front-end —
"this is where knowledge enters KMOS."

Phase 1 is deliberately scoped to **website acquisition only** (no enterprise connectors,
no API/feed/email/cloud ingestion, no AI agents, no workflow engines, no generic
acquisition framework). Those belong in later phases *only if a real product justifies
them* (Future Platform Rule, ADR-0018 / Ecosystem Constitution Article XI).

The founding question was whether web acquisition needs new platform primitives. It does
not: the web maps cleanly onto existing canonical objects and services.

## Decision

1. **Add `products/crawl-station` as flagship #003** (`@kmos/crawl-station-app`, port
   8092), a thin product over the KMOS platform substrate via `@kmos/sdk`. It adds **no
   domains** — the cleanest KMOS product to date — because acquisition maps directly onto
   platform primitives:

   | Web concept | KMOS canonical mapping | Principle |
   |---|---|---|
   | raw HTML response | `Asset` (Document, sha-256 checksum, provenance `origin=Ingested`, `originalSource=URL`) | Evidence before Files |
   | extracted readable content | derived `Asset` + `recordDerivation` | Lineage / chain of custody |
   | the page itself | `KnowledgeObject` (category `Topic`: title + summary) | Knowledge before Applications |
   | the discovery path | Knowledge relationship (`References`, parent → child) | Events/graph before Integration |
   | confidence in a page | `Governance.assessTrust` (explainable, evidence-driven) | Trust before Optimization |
   | findability | `SearchService` index (rebuilt on crawl completion) | — |

   No new canonical objects or events were invented (KMOS-9999 §7/§8). Crawl **job
   state** is app-owned operational state (like Knowledge Studio's `Source`), persisted as
   one JSONB row per crawl in the shared PostgreSQL via the `SqlClient` port, and recovered
   on boot; the canonical knowledge is durable in the event log independently.

2. **Keep the acquisition logic *in the product*, not in the platform.** The crawl
   frontier, HTML/metadata extraction, URL canonicalization, and robots.txt parsing are
   pure, zero-dependency modules under `products/crawl-station/src` (`crawler.ts`,
   `extract.ts`, `urls.ts`, `robots.ts`). CrawlStation is KMOS's *first* web-acquisition
   app; per the evidence-first mandate these stay local until a **second** consumer
   justifies promotion to a shared `@kmos/web-acquisition` capability. Recorded as a
   deferred candidate with that trigger in `CAPABILITY-EVOLUTION-ROADMAP.md`.

3. **Trust is respect-first and honest.** Crawling honors robots.txt (allow/disallow with
   longest-match precedence, `*`/`$`, crawl-delay) and per-host politeness by default; the
   engine takes an injected `fetch` so the whole product tests fully offline. Trust is
   evidence-driven (integrity hash, real readable content, robots-compliant fetch,
   attribution) and never fabricated — a thin or non-extracting page is surfaced as *needs
   review*, not over-trusted.

4. **Production-ready on landing (KMOS-9999 §22):** offline deterministic tests
   (engine + live-socket end-to-end through the real platform), `Dockerfile`, Olares
   Application Chart, `npm run crawl`, root tsconfig/lockfile wiring, and inclusion in the
   ecosystem `release.yml` (fourth image + chart).

No platform redesign; no new capabilities; kernel stays frozen.

## Consequences

- The ecosystem gains a compelling acquisition front-end that is architecturally identical
  in shape to the other flagships (compose substrate → thin orchestration + UI), further
  validating that new products are *assembled*, not *constructed* (ADR-0018).
- Every acquired page carries provenance, an integrity hash, lineage, and explainable
  trust — acquisition is transparent, never a black box.
- The Future Platform Rule is upheld by direct evidence: a substantial new product shipped
  with **zero** platform/kernel changes.
- A concrete promotion trigger now exists for a future `@kmos/web-acquisition` capability
  (second consumer), keeping capability growth evidence-first.

## Alternatives considered

- **Invent canonical `CrawledPage` / `WebResource` objects and crawl events.** Rejected —
  `Asset` + `KnowledgeObject` + relationships model it faithfully; inventing objects would
  violate KMOS-9999 §7 and expand the frozen kernel without need.
- **Extract a `@kmos/web-acquisition` capability now.** Rejected — one consumer is not
  evidence; premature abstraction. Deferred with an explicit trigger.
- **Add a media/language domain (as the other flagships do).** Rejected — unnecessary;
  each page maps directly to a `Topic` KnowledgeObject, so CrawlStation composes the bare
  substrate.
- **Pull in a crawler/readability/HTML-parser dependency.** Rejected — the zero-dependency
  philosophy holds; a pragmatic pure extractor + frontier is sufficient for Phase 1 and
  keeps the image trivially deployable.

## References

- `products/crawl-station/` (code, tests, `README.md`, `ARCHITECTURE.md`, `docs/`).
- `documentation/CAPABILITY-EVOLUTION-ROADMAP.md` (deferred `@kmos/web-acquisition`).
- `documentation/ECOSYSTEM-STATUS.md`; ADR-0018 (Product Era + Future Platform Rule);
  ADR-0011 (read-model recovery); ADR-0013/0015 (evidence-first extraction precedent).
