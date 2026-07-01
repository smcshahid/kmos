# ADR 0013 — Provider-independent capability extraction from Knowledge Studio (KCSI-01)

## Status

**Accepted-plan** — approved by the owner 2026-07-01; execution autonomous through the
work packages in
[`engineering/KCSI-01-CAPABILITY-EXTRACTION-PLAN.md`](../../engineering/KCSI-01-CAPABILITY-EXTRACTION-PLAN.md).
Governed by, and consistent with, [ADR-0012](0012-architecture-freeze-and-application-driven-evolution.md)
(application-driven evolution) and [ADR-0003](0003-ports-and-adapters.md).

At approval the owner added two standing requirements, now in force (see Decision §4):
a living **Capability Evolution Roadmap**
([`documentation/CAPABILITY-EVOLUTION-ROADMAP.md`](../CAPABILITY-EVOLUTION-ROADMAP.md)),
and the rule that **every extracted capability records a promotion rationale** and
**every deferred capability records a promotion trigger**.

## Context

The KMOS Capability Services Initiative (KCSI-01) asks for a reusable capability
layer for the whole ecosystem. Investigation established two facts that reshape the
work:

1. **The capability layer already exists and is the constitutional design.** The
   Capability Registry + Runtime, Configuration, Search, five domains, the
   reference capabilities, and the Conformance Kit already realize
   "applications orchestrate; capabilities perform work; providers behind ports"
   (Platform Vision §3). The runtime is genuinely provider-independent — it
   resolves capabilities by contract (id+version), single active implementation
   (`platform/capability-runtime/src/infrastructure/in-memory-resolver.ts`).

2. **What is genuinely missing is proven by exactly one real application.**
   Knowledge Studio (`products/knowledge-studio`) already hand-rolls provider
   fallback / graceful degradation — twice, differently
   (`src/ollama-extraction.ts:93‑99`; `src/caption.ts:41‑43` + `src/studio.ts:218‑225`)
   — carries two reusable provider adapters trapped in the app
   (`ollama-extraction.ts`, `caption.ts`), and repeats the platform-substrate
   composition boilerplate every KMOS app must repeat (`src/platform.ts:47‑102`).

KCSI-01's literal framing ("pretend no applications exist; build for the next
decade; take significant time") conflicts with ADR-0012's ruling ("no speculative
expansion; evolve from the concrete, evidenced needs of real applications; every
change SHOULD cite the real application requirement it serves"). ADR-0012 is the
governing, in-force decision, and KCSI-01 itself embeds the same guardrail ("avoid
premature abstraction… genuine platform capabilities rather than another
framework"). The owner resolved the tension in favour of **evidence-first
extraction**.

## Decision

Execute KCSI-01's **substance** through ADR-0012's **discipline**: extract only what
Knowledge Studio has already proven, cite the app code for each abstraction, add no
speculative machinery, and leave Knowledge Studio behaving identically but smaller.

Extract (each citing its justification):

1. **`withFallback`** provider-fallback / graceful-degradation primitive into
   `@kmos/reference-capabilities` — a pure composition function over
   `CapabilityHandler`. _Justifies: `ollama-extraction.ts:93‑99`, `caption.ts:41‑43`._
2. **`@kmos/providers`** (one new package under `capabilities/`) holding the two
   proven adapters behind existing reference contracts: Ollama knowledge-extraction
   and HTTP caption/ASR transcription. _Justifies: `ollama-extraction.ts`, `caption.ts`,
   `youtube.ts`._
3. **`@kmos/sdk`** promoted from templates to a real **platform-substrate** factory
   (`createPlatformRuntime`) composing the 8 platform services + durable/in-memory
   EventLog + boot hydration. _Justifies: `platform.ts:47‑102`._
   Domain composition **remains in the application** (KMOS-0200 §17; and `sdk`(2)
   may not import `domains`(3) under the fitness dependency rule).

Explicitly **defer** (no current application evidence; documented in the plan §3):
media/ffmpeg services, language services beyond extraction, publishing services,
and — emphatically — any **capability registry / discovery / routing /
cost-latency-quality selection / plugin system**. Knowledge Studio has one primary +
one fallback per capability and static `if (env)` selection; there is no evidence to
justify dynamic routing, and building it would be the "another framework" outcome the
initiative forbids.

No kernel, constitution, or catalog change. All work is additive at the
capabilities / sdk / application layers — the freeze's sanctioned evolution surface.

**4. Evidence-first is made durable, not one-off (owner requirement).** A living
**Capability Evolution Roadmap** (`documentation/CAPABILITY-EVOLUTION-ROADMAP.md`) is
the citable record of capability lifecycle. Two rules are standing definition-of-done,
enforced beyond KCSI-01:
- **Every extracted capability carries a promotion rationale** — the specific
  application evidence that earned its move into the platform — recorded in the
  roadmap in the same change that extracts it.
- **Every deferred capability carries a promotion trigger** — the concrete, observable
  condition that will later justify extraction — recorded in the roadmap when it is
  deferred.

A capability may not enter the platform without a roadmap rationale; a candidate may
not be deferred without a roadmap trigger.

## Consequences

- The next KMOS application inherits provider adapters, fallback/degradation, and the
  platform substrate without re-implementation; provider-specific HTTP logic leaves
  the application entirely.
- Knowledge Studio shrinks and becomes provider-independent while behaving
  identically (test parity + demo/serve smoke gate the change).
- The platform gains exactly **one** new package plus two small additions — no
  framework, no registry, no discovery.
- The deferred set is recorded, so a future contributor sees precisely what waits for
  a second application and why — the evidence-first boundary stays visible.
- ADR-0012 is honoured: every added abstraction cites the real application need it
  serves.
- The Capability Evolution Roadmap turns the evidence-first rule into a standing,
  machine-visible discipline: future initiatives inherit the promotion-rationale /
  promotion-trigger requirement, so the boundary between "proven" and "speculative"
  cannot silently erode.

## Alternatives considered

- **Build the full speculative decade-layer (KCSI-01 literal).** Rejected: conflicts
  with ADR-0012; high risk of premature abstraction and an unused framework.
- **Design-only, ratify before any code.** Rejected by the owner in favour of
  plan+ADR-first then autonomous execution.
- **Add provider metadata + routing to the runtime now.** Rejected: no application
  evidence; single primary+fallback is all that is proven. Revisit when a second app
  needs multi-provider selection.
- **Put `withFallback` / adapters in a dedicated new package each.** Rejected:
  package proliferation for tiny units; one adapter package + one contract-package
  addition is sufficient.

## References

- `engineering/KCSI-01-CAPABILITY-EXTRACTION-PLAN.md` (work packages, evidence table,
  fitness verification, success criteria).
- `documentation/CAPABILITY-EVOLUTION-ROADMAP.md` (living lifecycle record; promotion
  rationale per extracted capability, promotion trigger per deferred capability).
- ADR-0012 (application-driven evolution); ADR-0003 (ports and adapters);
  ADR-0007 (Conformance Kit).
- Cited app code: `products/knowledge-studio/src/{ollama-extraction,caption,youtube,platform,studio,index}.ts`.
- Fitness layering: `tools/fitness-checks/run.mjs:31‑42`. Composition ownership:
  KMOS-0200 §17. Platform Vision §3 (capabilities/SDK layer).
