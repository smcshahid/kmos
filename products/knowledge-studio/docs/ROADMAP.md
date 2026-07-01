# Knowledge Studio — Roadmap

**Version 1 is intentionally small and excellent. Future versions expand naturally** —
the architecture is source- and output-agnostic so growth needs no redesign
([ARCHITECTURE.md](ARCHITECTURE.md)). Dates are directional, not commitments.

## V1 — Verifiable knowledge core (shipped)

YouTube URL + transcript/upload → visible pipeline → transcript, chapters, first-class
concepts, **evidence quotes** (jump-to-moment), related concepts, **lineage**,
**explainable trust**, semantic search, collections, and a cited **Download Center**.
Thin over KMOS; provider-independent AI behind contracts; runs fully offline. Tested,
lint/fitness-clean, reviewed.

## V1.1 — Daily driver (shipped)

- ✅ **Job-state persistence** in shared PostgreSQL — the full experience survives a
  restart (proven against real PostgreSQL).
- ✅ **Daily-driver UX** — favorites, recent, persistent job history, retry, resume-
  interrupted, YouTube auto-detect.
- ✅ **Production caption/ASR seam** (`KS_CAPTION_ENDPOINT`) — provider-independent YouTube
  processing with honest degradation.
- ✅ **Olares packaging** — companion app sharing the KMOS PostgreSQL (shared/isolated
  modes); self-proving image.

## V1.2 — Frictionless YouTube & richer knowledge (next)

- **Real AI capabilities wired on Olares.** Whisper/Speaches ASR behind the caption seam;
  **Ollama/hosted-LLM extraction** for materially richer concepts + definitions; real
  translation. Provider-independent, behind contracts.
- **Language-domain capability injection** (with an ADR) — a small, backward-compatible
  seam so the app can select a production extraction/translation capability without a fork.
- **Cross-source library** — unified search + relationships across lectures; a "recently
  learned" home.
- **Accessibility pass** — drawer focus-trap/return-focus; published a11y statement.
- **Incremental search indexing** + capped relation pass for large libraries.
- **Manual refinement.** Edit chapters and concept definitions (curation as a KMOS
  governance action).

## V2 — Media outputs & new inputs

- **Clips & Reels.** Manual clip builder (start/end) and AI smart clips (teaching moments,
  stories, quotes), rendered by an **ffmpeg** capability; vertical Reel/Short export. (V1
  defines the clip model; V2 renders it.)
- **New content types.** PDF, articles, research papers, podcasts, meeting/Zoom recordings —
  each an *acquire* + optional transcription capability over the same core.
- **Side-by-side translation viewing** and downloadable multilingual transcripts.

## V3+ — Knowledge products & scale

- **Generated study artifacts** (citable by construction): flashcards, quizzes, study
  guides, mind maps, teaching outlines, presentations, blog drafts, citation packages,
  learning plans, research reports — renderers over verifiable knowledge.
- **Collections UX**: annotate, reorder, share, export.
- **Multi-user**: identities, permissions, and collaboration on top of KMOS Identity +
  Governance.
- **Cross-source knowledge**: relationships and search that span your whole library.

## Non-goals (holding the line)

No global knowledge-graph "hairball"; no AI-chatbot-as-the-product; no video-editing studio;
no feature pile. AI serves understanding behind contracts; evidence is never fabricated; the
KMOS kernel stays frozen (ADR-0012) and evolves only through the governed process.
