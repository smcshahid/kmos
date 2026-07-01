# Lecture Explorer — Product Vision

## The one-sentence vision

**Lecture Explorer turns a lecture from something you *watch* into something you can
*navigate* — a calm, explorable map of ideas where every concept is traceable to the
exact moment it was said, why it's trustworthy, and how it connects to everything
else.**

## The problem

Long-form knowledge — lectures, talks, sermons, courses — is trapped in a timeline.
To find the one idea you remember, you scrub a progress bar. To connect two ideas an
hour apart, you hold them in your head. To trust a claim, you re-watch. To cite it,
you transcribe by hand. The richest knowledge we produce is the least navigable.

Today's tools each solve a sliver and stop:
- **Players** (YouTube, podcast apps) give you a timeline and maybe chapters.
- **Transcript tools** give you searchable text but no structure.
- **AI notebooks** (NotebookLM) generate summaries and answers *about* your sources —
  useful, but ephemeral, session-bound, and only as trustworthy as the model's
  citation. You don't come away *owning* a durable, verifiable structure.
- **PKM tools** (Obsidian, Logseq, Roam) let you build a knowledge graph — by hand,
  with enormous effort, and no grounding back to the source.

No product turns a lecture into a **persistent, owned, evidence-grounded, navigable
knowledge structure** — automatically. That is the gap.

## The product

Import a lecture. Lecture Explorer processes it into an **explorable knowledge
experience**:

- **Chapters** segment the timeline into a readable outline.
- **Concepts** are extracted as first-class, named ideas — not tags, but objects you
  can open, follow, and collect.
- **Every concept carries its evidence**: the exact transcript quote (and timestamp)
  where it was said. One click verifies it in seconds. No faith required.
- **Relationships** connect concepts ("explains", "contrasts", "builds on"), so you
  navigate *ideas*, not minutes.
- **Lineage** shows the chain of custody — this concept came from this transcript,
  which came from this audio, which came from this lecture — visible and verifiable.
- **Trust** is explainable: each concept shows why it's (or isn't) trustworthy —
  evidence present, source integrity, review status — never an opaque score.
- **Semantic search** finds ideas by meaning across everything you've imported.
- **Collections & citations** let you gather discoveries and export them, cited.

You can use all of this **without ever knowing KMOS exists.** But every one of these
experiences is a KMOS capability made visible.

## Why this is the front door to KMOS

The strategic test for this app: *if this were someone's first experience of KMOS,
would they immediately understand why the platform exists?*

Yes — because Lecture Explorer makes KMOS's reason-for-being **tangible**:
- **Knowledge before applications** → concepts are durable objects you own, not rows
  in an app's database.
- **Evidence before files** → every idea is backed by a reproducible quote, not a
  vibe or an AI citation that may be fabricated.
- **Lineage & trust** → you can always answer "where did this come from, and can I
  trust it?" — the question every other knowledge tool leaves unanswered.
- **Institutional memory** → the whole exploration is a replayable event history; the
  knowledge outlives the app.

Where NotebookLM says "the AI read your sources," Lecture Explorer says "**here is the
verifiable structure of what was said, and here is the proof.**" That is the KMOS
difference, and it is the whole point.

## The wedge, and the platform behind it

Lecture Explorer is the "Apple Notes of KMOS" — the first thing a new user installs
because it *immediately* shows value. Its architecture is deliberately general: a
lecture is just one kind of long-form source. The same engine — import → segment →
extract concepts → ground in evidence → relate → make trustworthy → make navigable —
extends to **books, articles, research papers, podcasts, meetings, courses,
conversations**. Lecture Explorer proves the pattern; the ecosystem (Media Pipeline,
Research, Publishing, Learning, MuhammadanWay) inherits it.

## What Lecture Explorer is NOT

- Not a video editor, not a media host, not a note-taking replacement.
- Not an "AI chat over documents" clone — AI serves *understanding and structure*,
  behind KMOS capability contracts, never as the product's centre of gravity.
- Not a global knowledge-graph "hairball" (see UX Research) — exploration is always
  *focused* and *from where you are*, never an undigestible everything-view.
- Not a feature pile — V1 does a small number of things excellently (see PRD).

## Design north stars

1. **Knowledge is the hero.** Calm, readable, minimal. Clarity over decoration.
2. **Every claim is verifiable.** Evidence is one click away, always.
3. **Explore, don't CRUD.** The primary verb is *navigate*, not *manage*.
4. **Trust is explained, never asserted.** Show the reasons, not just a number.
5. **The platform is invisible; its value is not.** Users feel KMOS without seeing it.

## Success, in one line

A learner, researcher, or student finishes a session in Lecture Explorer **having
understood a lecture more deeply than watching it twice** — and knowing they can
trust, cite, and return to what they found. If we achieve that, we've built the
standard the KMOS ecosystem should aspire to.
