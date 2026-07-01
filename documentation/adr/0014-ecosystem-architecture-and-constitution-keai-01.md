# ADR 0014 — KMOS Ecosystem Architecture, Constitution, and evidence-first growth (KEAI-01)

## Status

**Proposed** — awaiting owner ratification. Architecture-and-research initiative; no code
changed. Builds on and is consistent with
[ADR-0012](0012-architecture-freeze-and-application-driven-evolution.md) (application-
driven evolution) and [ADR-0013](0013-provider-capability-extraction-kcsi-01.md) (KCSI-01).
Deliverables: `documentation/ecosystem/` (index:
`KEAI-01-INDEX-AND-RECOMMENDATION.md`); flagship:
`documentation/ecosystem/ECOSYSTEM-CONSTITUTION.md`.

## Context

KMOS v1.0 is GA; Knowledge Studio and KCSI-01 (the first capability extraction) are
complete. Before building many more applications, KEAI-01 studied three prior systems as
**evidence, not implementation targets** — AIMPOS (`AI Production Media`), Media Pipeline
/ MPP (`Media Processing Platform` + `olares-one/apps/media-pipeline`), and `olares-one` —
to determine what the ecosystem should become.

**Central finding:** the four systems (including KMOS) **converged independently on one
architecture** — canonical catalog/log as system of record, immutable provenance +
lineage, capability-first provider abstraction, durable + deterministic + human-gated
workflows, Olares-first-but-portable deployment. KMOS is the distilled, constitutional
form. The ecosystem needs codifying and evidence-based growth, not invention or redesign.

## Decision

1. **Adopt the KMOS Ecosystem Constitution** (`ECOSYSTEM-CONSTITUTION.md`) as the enduring
   principles for the layers above KMOS (capabilities, providers, SDK, applications). It
   does not modify the frozen platform kernel/constitution; it governs the ecosystem. Its
   ten articles define: what a platform capability is (C1–C5 tests), what an application
   responsibility is, when to extract vs. defer (evidence-first), the capability-first
   provider law (fallback within a capability, fail-closed, resilient adapters),
   permanence of knowledge/provenance/lineage, governed durable human-gated work, Olares-
   first portable immutable deployment, and the eight fixed stars that must never change.

2. **Record the capability classification** (`KEAI-01-CAPABILITY-INVENTORY.md`):
   Already-Exists (KMOS core + KCSI-01), Emerging, Candidate (evidenced ≥2-app spine),
   Future, and explicit application-responsibilities that must never be extracted. All
   Candidates stay **deferred with concrete triggers** in the roadmap §4a — nothing is
   built speculatively.

3. **Affirm KCSI-01 as correct and validated**; adopt two *additive* refinements when a
   real need pulls them: adapter **resilience/idempotency**, and **quality-tier +
   fail-closed** semantics on the fallback pattern (`withFallback` grows, not replaced).

4. **Final recommendation: Option B** — complete one more *application-bearing* capability
   initiative before broad app-building: build Media Pipeline (or Podcast Studio) on KMOS
   as the second consumer that legitimately promotes the evidenced Candidate spine, plus
   two low-risk refinements now (translation provider; resilience + quality-tier). No
   speculative expansion; no redesign.

5. **Keep the kernel frozen; grow only on evidence.** Every future capability cites the
   real application that pulled it and records a roadmap promotion rationale (or trigger if
   deferred) in the same change — standing definition-of-done, now ecosystem-wide.

## Consequences

- The ecosystem has a short, durable constitution a new contributor can read to build the
  next applications correctly — the founder's stated highest-value outcome.
- The capability roadmap gains real second-consumer evidence (from prior systems) with
  concrete triggers, without building anything speculatively.
- A single, evidenced next step (Option B) replaces open-ended expansion; after it, most
  new-application work becomes composition.
- Prior systems' lessons (capability-first routing, propose-never-publish, tiered
  preservation, resilience-by-default, Olares-authoritative verification, operational
  memory) are preserved as principles without importing legacy code.
- KCSI-01 is confirmed; no rework; only additive refinement.

## Alternatives considered

- **Option A (layer mature — focus on apps).** Rejected: only ~3 capabilities extracted;
  would push the evidenced spine into every app as duplicated provider coupling.
- **Option C (significant revision first).** Rejected: four independent systems validate
  the architecture; no evidence for redesign; proposing one violates evidence-first.
- **Speculative build-out of the whole capability spine now.** Rejected: violates ADR-0012
  and the Ecosystem Constitution (Article IV); manufactures over-abstraction debt.
- **A capability registry / discovery / routing framework.** Rejected: no application needs
  it; AIMPOS's own evidence warns against generic plugin systems.

## References

- `documentation/ecosystem/` (constitution + 10 deliverables; index +
  recommendation in `KEAI-01-INDEX-AND-RECOMMENDATION.md`).
- `documentation/CAPABILITY-EVOLUTION-ROADMAP.md` §4a (ecosystem candidates).
- ADR-0012 (application-driven evolution), ADR-0013 (KCSI-01).
- Evidence studied (reference-only, not migrated): `AI Production Media` (AIMPOS),
  `Media Processing Platform` / `olares-one/apps/media-pipeline`, `olares-one`.
