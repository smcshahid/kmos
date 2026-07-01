# Lecture Explorer — UX Research Summary

Synthesis of what makes exploration, search, evidence, and knowledge interfaces work —
and the traps to avoid — translated into design principles and core flows.

## Findings that shape the design

### 1. The knowledge graph "hairball" is a trap — design *focused* views instead
Node-link/force-directed graphs collapse into an unreadable "hairball" past a link
density of ~3 and are "impossible to interpret" at scale; end users can't digest them
([eagereyes](https://eagereyes.org/blog/2012/graphs-hairball),
[Cambridge Intelligence](https://cambridge-intelligence.com/blog/hairball-effect-in-graph-visualization/),
[arXiv: KGs in Practice](https://arxiv.org/pdf/2304.01311)). Best practice: **work
backward from the user's job; don't visualize everything.**
→ **Principle:** never show a global graph. Show **"from here" views** — the concepts
*around the one you're looking at*, 1–2 hops, filtered and labeled. Exploration is
always local, contextual, and purposeful.

### 2. Citations build trust — but only if verifiable in one click
Citation is the single most important trust mechanism: it shifts verification from user
to system and makes it tractable — *click the claim, see the exact passage, confirm in
seconds* ([ClarityArc](https://www.clarityarc.com/insights/ai-hallucination-grounding-citation)).
But citation systems fail by mis-attribution and fabrication ([NN/g](https://www.nngroup.com/articles/ai-hallucinations/)).
→ **Principle:** **evidence is a first-class, always-one-click artifact** — the real
transcript quote + timestamp, backed by KMOS evidence objects (reproducible, integrity-
checked), not a model-generated link. Never assert; always let the user verify.

### 3. Concept-threaded navigation beats the timeline for *ideas*
Research prototypes (ConceptThread, Topics-Map) show users navigate long video best by
**clicking a concept to jump to where it's discussed**, with concept "sparklines" and
threaded views ([arXiv ConceptThread](https://arxiv.org/pdf/2401.11132)).
→ **Principle:** the concept is the primary navigational unit; the transcript and
timeline are *synchronized secondary* views, not the main event.

### 4. AI notebooks prove the appetite; ephemerality is their weakness
NotebookLM's Studio (study guides, mind maps) shows people *want* structure derived
from sources — but it's regenerated per session, not owned.
→ **Principle:** derive structure *once*, persist it as owned knowledge, let the user
return to and build on it.

### 5. Calm, reading-first interfaces win for knowledge work
The tools people live in for hours (Obsidian, Readwise Reader, iA Writer) are quiet,
typographic, low-chrome. Decoration fatigues; clarity sustains.
→ **Principle:** typographic, generous whitespace, restrained color; motion only to
aid orientation.

## Design principles (the discipline)

1. **Evidence-first.** No concept without a way to verify it. The quote is sacred.
2. **Local exploration, not global maps.** Always "from where you are."
3. **The concept is the unit.** Navigate ideas; timeline/transcript are in service.
4. **Progressive disclosure.** Start with the outline; reveal depth on demand.
5. **Trust is shown, not scored.** Reasons ("has 3 evidence quotes; source integrity
   verified; not yet reviewed"), never an unexplained number.
6. **Calm & readable.** Knowledge is the hero; the UI recedes.
7. **Keyboard- and screen-reader-navigable.** Exploration must not require a mouse.

## Core flows (V1)

1. **Import → process (with visible progress).** Paste/upload a lecture → watch the
   pipeline (import → transcribe → segment → extract concepts → ground evidence →
   relate) with honest, legible status. The wait *teaches* what's being built.
2. **Read the outline.** Land on chapters + a concept list — a navigable table of
   contents for ideas, not minutes.
3. **Open a concept.** Definition, its **evidence quotes** (each jumps to the moment),
   **related concepts** (focused "from here" view), **lineage** (source chain),
   **trust** (explained). This is the heart of the product.
4. **Search by meaning.** Type an idea; get concepts + the exact supporting quotes,
   ranked; jump straight in.
5. **Collect & cite.** Bookmark concepts/quotes into a Collection; export a cited
   summary (Markdown/plain text) with source + timestamp attribution.

## Empty, loading, and error states (designed, not afterthoughts)

- **First-run empty:** a single, warm call to action ("Import your first lecture") +
  one example to explore, so the value is felt before any upload.
- **Processing:** a staged, honest progress narrative (not a spinner) that names each
  step and what it produces; partial results appear as they're ready.
- **Errors:** plain-language, recoverable, blame-free ("We couldn't transcribe this
  audio — try a different file or paste a transcript"). Never a stack trace.
- **Low-confidence:** unverified/low-evidence concepts are clearly, calmly marked —
  honesty over false polish.

## Accessibility (WCAG 2.2 AA target)

- Full keyboard navigation; visible focus; logical tab order; skip links.
- Semantic landmarks/headings; ARIA only where semantics fall short.
- Color never the sole signal (trust/confidence also carry text + icon).
- Contrast ≥ 4.5:1 body; reduced-motion honored; transcript = built-in captions
  substitute; targets ≥ 24px.

## Desktop & mobile

- **Desktop (primary):** a two/three-pane reading layout — outline ▸ concept detail ▸
  evidence/transcript — optimized for deep sessions.
- **Mobile:** single-column, concept-first; the same flows, progressively disclosed;
  read + explore + search + bookmark (heavy curation stays desktop). No feature is
  desktop-only in a way that breaks the core journey.
