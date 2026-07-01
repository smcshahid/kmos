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

## V1.x — Depth & production AI (next)

- **Job-state persistence.** Persist per-source pipeline state + transcript segments so the
  full experience (and the evidence-quote projection) survives restarts and enables
  multi-replica scale. *(Top operational item — see OPERATIONS-GUIDE.)*
- **Real AI capabilities.** First-class adapters behind existing contracts: Whisper/Speaches
  transcription, Ollama/hosted-LLM extraction (richer concepts + definitions), real
  translation. No app change — capability swap only.
- **YouTube caption/audio fetch.** Wire the `CaptionFetcher` seam to a yt-dlp/caption
  capability so the *acquire* stage runs end-to-end without pasting.
- **Smarter chapters + concepts.** Topic-shift segmentation; keyphrase-quality extraction;
  concept de-noising.
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
