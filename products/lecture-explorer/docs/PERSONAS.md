# Lecture Explorer — User Personas

Three real people we build for. V1 optimizes for the **Primary**; the others must not
be blocked.

## Primary — "The Serious Learner" (Amina, 27, self-directed student)

Watches long lectures and talks to genuinely *learn* — not to pass time. Rewatches to
find "that one point," keeps scattered notes, worries she's misremembering or citing
loosely. Wants to **understand deeply, verify, and remember**.

- **Jobs:** grasp a lecture's structure fast; find and trust a specific claim; connect
  ideas across a talk; collect what matters; come back to it later.
- **Pains:** timeline scrubbing; note-taking that loses the source; no way to verify a
  half-remembered claim; knowledge evaporates after watching.
- **Wins with LE:** an outline of ideas, each with its exact quote; searchable by
  meaning; collectable; trustworthy. *Understands more than watching twice.*
- **Success signal:** returns to a lecture days later and immediately finds + trusts
  what she needs.

## Secondary — "The Researcher/Knowledge Worker" (David, 41, analyst)

Consumes talks, panels, and interviews for work; must cite accurately and defend
claims. Values **provenance and rigor** over polish.

- **Jobs:** extract citable claims with exact attribution; assess trustworthiness;
  trace where a claim came from; export for a report.
- **Pains:** hand-transcribing quotes; AI tools that fabricate citations; no chain of
  custody; can't defend "the source says…".
- **Wins with LE:** first-class **evidence + lineage + explainable trust**; export
  cited findings. *Verifiable, defensible knowledge.*
- **Success signal:** ships a report citing a lecture with confidence and exact refs.

## Secondary — "The Curator/Educator" (Yusuf, 35, teacher / community lead)

Turns talks into study material for others; builds collections; shares discoveries.

- **Jobs:** curate concepts into themed collections; approve/annotate; share an
  explorable view; generate study/citation exports.
- **Pains:** manual summarizing; no durable, shareable structure; trust/quality varies.
- **Wins with LE:** governed collections (approve, annotate, trust), shareable
  explorable views, exports. *(Governance/sharing depth grows post-V1.)*
- **Success signal:** publishes a curated, trustworthy collection others explore.

## Anti-persona (who we do NOT build V1 for)

- **The passive viewer** who just wants to hit play — a player already serves them.
- **The team wiki admin** wanting CRUD/permissions dashboards — that's not exploration.
- **The prompt-tinkerer** chasing AI novelty — AI here serves understanding, quietly.

## Design implications

- Optimize the **open-a-concept → verify → collect** loop for Amina above all.
- Never compromise **evidence/lineage/trust** — it's David's whole reason to switch and
  a core KMOS demonstration.
- Keep **collections/sharing** present but lightweight in V1; deepen for Yusuf later.
