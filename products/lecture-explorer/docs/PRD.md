# Lecture Explorer — Product Requirements (V1)

Status: draft for build. Companion: PRODUCT-VISION, COMPETITIVE-ANALYSIS, UX-RESEARCH,
PERSONAS, INFORMATION-ARCHITECTURE. Scope is **deliberately small and excellent.**

## 1. Problem & audience

Long-form knowledge is trapped in a timeline; no tool turns a lecture into a durable,
owned, **evidence-grounded, navigable** knowledge structure automatically (see
Competitive Analysis). Primary audience: **the Serious Learner** (Amina); secondary:
Researcher (David), Curator (Yusuf). See PERSONAS.

## 2. V1 goals (what success looks like)

1. Import a lecture and watch it become an **explorable structure** (chapters +
   concepts) with honest, legible progress.
2. **Open a concept** and see its definition, **evidence quotes** (jump to moment),
   **related concepts** (focused view), **lineage**, and **explainable trust**.
3. **Search by meaning** and land on concepts + their supporting quotes.
4. **Collect** discoveries and **export** them, cited.
5. Do all of the above **without knowing KMOS exists**, while every step exercises a
   KMOS capability.

## 3. In scope (V1) — the smallest excellent product

| # | Capability | Notes |
|---|---|---|
| F1 | Import a lecture (audio/video ref or pasted transcript) | reference/URL + transcript-paste in V1; direct upload/transcription behind a capability |
| F2 | Visible processing pipeline | staged, honest progress; partial results stream in |
| F3 | Chapters (segmented outline) | readable table-of-contents of the talk |
| F4 | Concept extraction (first-class objects) | named, openable, collectable |
| F5 | Concept detail: definition + **evidence quotes** (w/ timestamp, jump) | the heart of the product |
| F6 | Related concepts — **focused "from here" view** | 1–2 hops, labeled; NEVER a global graph |
| F7 | **Lineage** (concept ← transcript ← audio ← lecture) | visible chain of custody |
| F8 | **Explainable trust** per concept | reasons, not a bare score |
| F9 | Semantic search across concepts + evidence | meaning-based; jump to result |
| F10 | Collections (bookmark concepts/quotes) | lightweight curation |
| F11 | Export cited findings (Markdown/plain text) | source + timestamp attribution |
| F12 | Library (list of imported lectures) | re-open, durable, owned |
| NF | Accessibility (WCAG 2.2 AA), calm reading UI, keyboard nav, mobile-usable core | see UX-RESEARCH |

## 4. Explicitly OUT of scope (V1) — to protect focus

- Video hosting/playback studio, editing, or media transcoding UI.
- Real-time collaboration, comments, multi-user permissions dashboards.
- A global knowledge-graph "hairball" visualization (anti-goal — see UX-RESEARCH).
- Native mobile apps (responsive web only).
- AI chat/agent as the primary surface (AI serves structure + search, not a chatbot).
- Non-lecture source types (books/papers/podcasts) — architecture allows them; V1 ships
  lectures only.
- Payments, accounts/teams beyond a single identity, sharing beyond export.

## 5. KMOS mapping (respect platform boundaries)

Lecture Explorer is a **thin application over KMOS** — orchestration + UX; **no business
logic in the app**; nothing bypasses KMOS. (Kernel unchanged — ADR-0012.)

| Product concept | KMOS mechanism |
|---|---|
| Lecture, audio, transcript | **Assets** (+ storage refs) with **lineage** & **provenance** |
| Import → transcribe → segment → extract | **Media/Language domains** + **Workflow** + **Capabilities** (AI behind contracts) |
| Concept, relationship, vocabulary, collection | **Knowledge** objects (canonical, versioned, owned) |
| Evidence quote backing a concept | **Evidence** (by-identifier refs to transcript spans) + Asset integrity |
| Trust of a concept | **Governance** trust assessment (explainable) |
| Semantic search | **Search & Discovery** (projection-backed) |
| Processing/exploration history | **Events** (replayable) |
| Who imported/curated | **Identity** (attribution via CallContext) |
| Curate/approve a collection | **Governance** approvals (lightweight in V1) |

**AI is provider-agnostic:** transcription, concept extraction, Q&A/relationship
discovery are **KMOS capabilities** behind the capability contract — swappable
(Ollama/local, hosted, etc.), never hard-coded to a provider.

## 6. Functional requirements (selected, testable)

- **R1** Given an imported lecture, the system SHALL produce ≥1 chapter and ≥1 concept,
  each concept linked to ≥1 evidence quote with a source timestamp.
- **R2** Opening a concept SHALL show its definition, all evidence quotes (each
  navigable to the source moment), related concepts (≤ a bounded, labeled set), lineage
  to the source asset, and a trust explanation with concrete reasons.
- **R3** Search SHALL return concepts ranked by semantic relevance, each with at least
  one supporting quote, and allow jumping to the concept or the quote.
- **R4** A concept/quote SHALL be addable to a Collection; a Collection SHALL export to
  Markdown with source + timestamp citations.
- **R5** Every displayed claim SHALL be verifiable in ≤1 interaction (evidence one
  click away). No concept renders without a verify path.
- **R6** The processing pipeline SHALL report honest staged status and surface partial
  results as they complete; failures SHALL be recoverable and blame-free.
- **R7** The app SHALL persist across restarts (durable via KMOS) — a library and its
  concepts survive (leverages KMOS read-model recovery).

## 7. Non-functional requirements

- Accessibility WCAG 2.2 AA; keyboard-complete; reduced-motion honored.
- Perf: concept detail interactive < 200ms on a warm library; search < 1s typical.
- Security/trust: no fabricated evidence — quotes are real spans; low-confidence marked.
- Provider-agnostic AI; no PII beyond the single identity in V1.
- Production engineering: tests, docs, Conventional Commits, ADRs, release notes.

## 8. Success criteria (V1 "done")

1. A new user imports a lecture and, within one session, opens a concept, verifies it
   via its quote, finds a related idea, searches by meaning, and exports a cited note —
   **without instructions.**
2. Every concept shown is **verifiable and trust-explained**; no dead ends.
3. The app is **demonstrable publicly** and passes UX, a11y, code, product, perf, and
   security reviews.
4. It **visibly exercises** KMOS (assets, knowledge, evidence, lineage, trust, search,
   events, workflow, capabilities, identity) — provable via the event history.
5. The independent product review answers **yes** to: *useful standalone? proud to
   demo? showcases KMOS? solves a real problem? focused/elegant? differentiated?*

## 9. Open questions (resolve in Architecture/Design phase)

- Evidence granularity: sentence-span vs. paragraph — pick the smallest reliably-
  groundable unit.
- Relationship source: capability-extracted vs. co-occurrence heuristic for V1.
- Where the app's *own* view-state (bookmarks/collections UI prefs) lives vs. KMOS
  (collections are KMOS Knowledge; UI prefs are app-local).
- Deployment shape: extend the KMOS api-server, or a dedicated LE backend consuming
  `@kmos/*`? (Architecture phase.)
