# Ten-Year Vision

_KEAI-01 · 2026-07-01._ The ecosystem after a decade — architecture, not features. What
evolves, what stays stable, what must never change.

## 1. The scene in 2036

An institution runs a dozen applications — Knowledge, Media, Podcast, Meeting, Research,
Publishing studios, MuhammadanWay, and products not yet imagined — all on one KMOS
knowledge core. The AI models of 2036 are unrecognizable from 2026's; the media engines,
the cloud, and the UIs have all turned over two or three times. **None of that required
rewriting the applications**, because each app was built as thin orchestration over
capability contracts, and every provider sat behind one of those contracts.

A new developer joins. They read the Ecosystem Constitution and the Development Guide,
scaffold an app with the SDK, compose the capabilities they need, inject whatever
providers the estate offers, and ship — without knowing which engine transcribes,
translates, renders, or reasons. That is the success condition, realized.

## 2. What will have evolved (expected, healthy churn)

- **Providers and models** — many generations of ASR, LLMs, MT, diffusion, avatar, and
  media engines came and went behind unchanged capability contracts.
- **The capability layer** — grew from ~3 capabilities to a rich, *evidence-earned*
  library; each addition traceable to a real application, each with a promotion rationale.
- **Applications** — appeared, matured, some retired; the knowledge they produced
  outlived them all.
- **Infrastructure** — Olares, K8s, cloud, storage, GPU scheduling all changed behind
  ports; deployments moved targets without touching business code.
- **The SDK** — accreted ergonomics (wiring, quality tiers, resilience, scaffolding,
  client libs), always additively, always thin.

## 3. What will have stayed stable (the load-bearing frame)

- **The four-layer shape** (applications → capabilities → KMOS → infrastructure) and the
  down-only dependency rule.
- **The capability contract as the unit of reuse** — intent in, canonical objects/events
  out, provider invisible.
- **Evidence-first evolution** — nothing extracted without a second consumer; nothing
  abstracted ahead of demand; the roadmap's rationale/trigger discipline intact.
- **Governance-with-code** — ADRs, reviews, conformance, evidence, honest debt.

## 4. What must never change (the fixed stars — from Constitution Art. X)

1. Knowledge and evidence outlive applications, media, and AI.
2. The event log is the system of record; read models are projections.
3. Canonical types are singular and frozen.
4. Business logic lives only in capabilities; applications stay thin.
5. Providers are replaceable and invisible to applications.
6. Provenance is immutable; lineage is first-class; trust is honest.
7. Extraction is evidence-first; abstraction is never built ahead of demand.
8. Governance, attribution, and explainability are built in.

If a future change would violate one of these, it is not an evolution of KMOS — it is a
different system, and should be built as one, elsewhere.

## 5. How the evolution should be steered

- **Let applications pull.** Every capability enters the shared layer because a real app
  needed it, proven by a second consumer. Resist the urge to "get ahead."
- **Refine, don't rebuild.** The architecture is validated by four independent systems;
  its future is accretion and refinement, not redesign. Treat any proposal for
  fundamental revision with deep skepticism and demand extraordinary evidence.
- **Keep the core small.** Ten years of flexibility must come from adapters, capabilities,
  the SDK, and applications — never from growing the frozen kernel.
- **Protect simplicity.** The most valuable thing to preserve is that a new application is
  mostly composition. Every abstraction that makes apps *thinner* is welcome; every one
  that makes them *know more* is suspect.

## 6. The measure, restated

Ten years out, the test is unchanged from day one: *can a developer build a new KMOS
application without caring which provider does the work, and without rewriting when those
providers change?* If yes — as this architecture is designed to ensure — then the
ecosystem will have done its job, and the founder's knowledge, evidence, and institutional
memory will have survived every technology cycle that passed beneath them.
