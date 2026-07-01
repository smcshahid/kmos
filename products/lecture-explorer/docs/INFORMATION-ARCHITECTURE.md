# Lecture Explorer — Information Architecture

How the product is structured for **exploration**, not management. The organizing idea:
**the concept is the atom; everything else orients around the concept you're looking at.**

## The mental model

```
Library ─▶ Lecture ─▶ (Outline: Chapters + Concepts)
                           │
                           ▼
                       CONCEPT ◀── the center of gravity
                        ├─ Definition
                        ├─ Evidence quotes ──▶ (jump to moment in transcript/timeline)
                        ├─ Related concepts ──▶ (focused "from here" view → another CONCEPT)
                        ├─ Lineage ──▶ transcript ◀ audio ◀ lecture (chain of custody)
                        └─ Trust ──▶ explained reasons
```

Navigation is a **loop, not a tree**: you land on a concept, verify it, step to a
related concept, verify that — understanding compounds. There is no global map; every
view is *relative to where you are* (avoids the hairball — see UX-RESEARCH).

## Primary navigation (top level)

1. **Library** — your imported lectures (durable, owned). Entry point + re-open.
2. **Explore** (within a lecture) — the outline + concept space. The core.
3. **Search** — meaning-based, global across the library; results are concepts+quotes.
4. **Collections** — your curated gatherings of concepts/quotes; export from here.

(Deliberately four. No settings-heavy nav, no admin surfaces in V1.)

## Screen / view inventory

| View | Purpose | Key elements |
|---|---|---|
| **Library** | choose/import a lecture | lecture cards (title, #concepts, imported-when), "Import" CTA, first-run empty state |
| **Import** | bring a lecture in | source input (ref/URL or paste transcript), start; then → Processing |
| **Processing** | watch it become structure | staged progress narrative (import→transcribe→segment→extract→ground→relate), partial results appear |
| **Lecture / Outline** | orient fast | chapters (segmented), concept list, jump-in points; the "table of contents of ideas" |
| **Concept detail** ★ | the heart | definition · evidence quotes (→ moment) · related concepts (focused) · lineage · trust (explained) · add-to-collection |
| **Transcript** (secondary) | verify in context | synchronized transcript; evidence spans highlighted; concept ↔ timestamp sync |
| **Search results** | find by meaning | ranked concepts, each with a supporting quote, jump actions |
| **Collection detail** | curate + export | gathered concepts/quotes, reorder/annotate (light), export cited |

★ Concept detail is where users spend most time; everything else feeds it.

## The concept detail layout (desktop)

A calm reading layout, three logical regions (responsive → stacked on mobile):

- **Center (reading):** concept name, definition, and its **evidence quotes** — each a
  blockquote with the source moment; clicking opens the synchronized transcript at that
  span. This is the verifiable core; it reads like a well-cited page.
- **Right (orient):** **Related concepts** (focused, labeled by relationship),
  **Lineage** (compact chain to the source), **Trust** (reasons + state). Bookmark.
- **Left (context, collapsible):** the lecture outline (chapters/concepts) so you never
  lose your place in the whole.

## Content types (surfaced from KMOS, named for humans)

| User-facing | KMOS object | Notes |
|---|---|---|
| Lecture | Asset (media) + derived Assets | the source |
| Transcript | Asset (derived, lineage to audio) | evidence lives here |
| Chapter | segment (app-projected from transcript/events) | outline unit |
| Concept | Knowledge object (Concept) | the atom; owned, versioned |
| Quote/Evidence | Evidence ref → transcript span | reproducible; the trust anchor |
| Relationship | Knowledge Relationship object | "explains/contrasts/builds-on" |
| Collection | Knowledge Collection object | curation |
| Trust | Governance trust assessment | explained |

Users see *Lecture, Concept, Quote, Collection* — never "canonical object" or "event."

## Information scent & wayfinding

- **Breadcrumbs of meaning:** Library ▸ Lecture ▸ Concept; plus a back-stack of visited
  concepts (you can retrace an exploration).
- **Every concept shows its 2–3 strongest relationships** as labeled next-steps, so
  there's always an obvious, meaningful "where to go next."
- **Evidence count + trust state** are visible on concept cards → scent for quality
  before you click.
- **Search is always reachable** (persistent affordance), the escape hatch to meaning.

## Extensibility (no dead ends)

The IA is source-type-agnostic: "Lecture" is one **Source** kind. Books, papers,
podcasts, meetings slot into the same Library ▸ Source ▸ Outline ▸ Concept model with
their own segmenters/extractors (KMOS capabilities). V1 hard-codes nothing that would
block that; it simply ships **Lecture** only.

## What we deliberately do NOT build into the IA

- A global graph/network canvas (hairball).
- A file-manager/CRUD hierarchy of folders.
- Deep settings trees, dashboards, or admin consoles.
- A chat window as the primary surface.
