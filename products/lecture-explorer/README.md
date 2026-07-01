# Lecture Explorer

The first flagship application built on KMOS — and the intended **front door to the
KMOS ecosystem**.

> Lecture Explorer turns a lecture from something you *watch* into something you can
> *navigate* — a calm, explorable map of ideas where every concept is traceable to the
> exact moment it was said, why it's trustworthy, and how it connects.

It is a real product (useful without ever knowing KMOS exists) that simultaneously makes
KMOS's reason-for-being tangible: **owned, evidence-grounded, navigable, verifiable
knowledge.** It exercises KMOS Knowledge, Assets, Evidence, Lineage, Trust, Search,
Events, Workflow, Capabilities, and Identity — without exposing platform complexity.

## Status

**Phase 1 — Product thinking: COMPLETE.** (Research, competitive analysis, discovery,
vision, PRD, personas, IA.) Architecture → implementation → reviews → release follow.

## Documents (`docs/`)

| Doc | What it answers |
|---|---|
| [PRODUCT-VISION](docs/PRODUCT-VISION.md) | Why this exists; the differentiation thesis; front-door-to-KMOS |
| [COMPETITIVE-ANALYSIS](docs/COMPETITIVE-ANALYSIS.md) | NotebookLM / PKM / Readwise / answer-engines; the un-owned quadrant |
| [UX-RESEARCH](docs/UX-RESEARCH.md) | Patterns + principles (evidence-first; avoid the graph "hairball") |
| [PERSONAS](docs/PERSONAS.md) | The Serious Learner (primary); Researcher; Curator |
| [PRD](docs/PRD.md) | V1 scope (in/out), requirements, KMOS mapping, success criteria |
| [INFORMATION-ARCHITECTURE](docs/INFORMATION-ARCHITECTURE.md) | The concept-centered navigation model + screens |

## Principles (the discipline)

Evidence-first · local exploration not global maps · the concept is the unit ·
progressive disclosure · trust shown not scored · calm & readable · accessible ·
**thin app over KMOS (no business logic in the app; kernel unchanged — ADR-0012).**

## Relationship to KMOS

Lecture Explorer consumes KMOS through its public services/capabilities; it adds
orchestration and UX only. Per the platform freeze (ADR-0012), the app drives evolution
by *revealing real needs* — the kernel changes only if genuine product experience
exposes a platform limitation, via the governed process.
