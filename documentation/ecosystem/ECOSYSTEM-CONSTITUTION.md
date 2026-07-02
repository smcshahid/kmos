# The KMOS Ecosystem Constitution

_Version 1.0 · 2026-07-01 · KEAI-01._
_The enduring principles for building applications on the KMOS ecosystem. If a
future contributor reads only this document, they should be able to build the next
five applications correctly._

> This is to the **ecosystem** what the KMOS Constitution (`constitution/`) is to the
> **platform**. It does not modify or override the platform constitution — the kernel,
> canonical catalogs, and platform constitution remain frozen (ADR-0012). It governs
> the layers *above* KMOS: capabilities, providers, the SDK, and applications.

---

## Preamble — why this exists

Four independent systems — KMOS, Knowledge Studio, AIMPOS (AI Production Media), and
the Media Processing Platform — were built over several years by the same hands, and
they **converged, without coordination, on the same architecture**: a canonical
catalog as the system of record, immutable provenance and lineage, capability-first
provider abstraction, durable governed workflows, and Olares-first-but-portable
deployment. That convergence is not a coincidence; it is the shape the problem keeps
forcing. This constitution codifies it so the next decade of applications inherits it
by default instead of rediscovering it by scar tissue.

The governing spirit is one sentence: **applications orchestrate; capabilities perform
work; providers are replaceable; knowledge is permanent.**

---

## Article I — The layered ecosystem

Four layers, and dependencies point **down only**:

```
Applications        thin: user journeys, UI/API, composition of capabilities
     ↓
Capability Layer    all business work, behind stable contracts; providers swap underneath
     ↓
KMOS Platform       knowledge · evidence · identity · governance · events · workflow · search
     ↓
Infrastructure      Olares / K8s / cloud · Postgres · object store · IPFS · model runtimes
```

An upper layer may depend on a lower one; **never the reverse**. In the KMOS monorepo
this is machine-enforced by architecture-fitness ranks
(`packages 0 · platform/engines 1 · capabilities/sdk 2 · domains 3 · applications 4 ·
products 5`); the same direction holds conceptually for out-of-tree apps.

**Inviolable boundaries (Article I is not negotiable):**

1. **The kernel is frozen.** Canonical objects, events, and the constitution change
   only through the KMOS-9999 §20 kernel-migration review with owner approval. No
   application or capability ever redefines a canonical type.
2. **No upward dependency.** A capability never imports a platform service’s internals;
   a platform service never imports a capability or application; the SDK never imports
   domains or applications.
3. **The log is the system of record.** Read models (graphs, search indexes, catalogs)
   are projections rebuildable by replay. Nothing authoritative lives only in a
   projection.
4. **Providers are invisible to applications.** An application never names Ollama,
   Whisper, yt-dlp, ffmpeg, EchoMimic, or their successors. It requests a capability.

---

## Article II — What is a platform (ecosystem) capability?

A **capability** is a unit of business work exposed behind a **stable, technology-free
contract**, that more than one application needs (or provably will), and whose
implementation can be replaced without changing its consumers.

A capability qualifies for the ecosystem (shared) layer when **all** of these hold:

- **C1 — Contract-stable.** Its inputs/outputs can be named in canonical terms
  (objects/events) and will not churn when the provider changes.
- **C2 — Provider-replaceable.** At least two plausible implementations exist (e.g.
  Whisper *and* Speaches *and* a cloud ASR), so the contract is not a disguised
  provider API.
- **C3 — Cross-application.** Two or more real applications need it, or one does and a
  second is concretely planned with cited evidence.
- **C4 — Kernel-only dependencies.** It depends on canonical types and its own
  contract — not on a platform service, a domain, or an application.
- **C5 — Deterministic core.** Its coordination logic is pure; all I/O is in injected
  adapters, so execution is replayable and testable offline.

If a unit fails C2, it is a **provider adapter**, not a capability (it lives *behind* a
capability). If it fails C3, it is **application logic** (Article III). If it fails C1,
it is not ready to be a capability yet — refine the contract first.

---

## Article III — What is an application responsibility?

An **application** is a thin layer that composes capabilities into a user journey. It
owns:

- **Orchestration** — the sequence and choreography of capability calls for *its*
  journey (Knowledge Studio’s ingest pipeline; Media Pipeline’s acquire→enrich→publish).
- **Provider selection** — the one-line choice of which provider to inject for a
  capability (usually "use X when configured, else the reference default"), driven by
  its own configuration.
- **Composition (the deployable)** — wiring the platform substrate (via the SDK) plus
  its domains, and its own UI/API surface. *Every deployable owns its composition*
  (KMOS-0200 §17).
- **Product semantics** — what "done", "trusted", "published" mean for *this* product.

An application **must not** contain business computation (that is a capability),
redefine canonical types, embed a provider SDK, or reach around a capability to a
provider. The test: if you deleted the application, no reusable business capability
should die with it.

---

## Article IV — When do we extract? When do we defer?

Extraction is **evidence-first, never speculative** (this is the load-bearing rule of
the whole ecosystem; it is inherited from ADR-0012 and proven by KCSI-01).

**Extract a capability into the shared layer when:**

- The same work is **implemented in two applications** (or one app plus a concretely
  planned second), *and*
- it satisfies C1–C5 (Article II), *and*
- extraction **removes duplication or provider-coupling** from the applications — it
  makes them smaller, not the platform bigger for its own sake.

**Defer when:**

- Only one application needs it (keep it in that application until a second appears).
- No contract is stable yet (the shape is still moving — let it settle in an app).
- The "reuse" is imagined, not demonstrated. A roadmap can accumulate speculative
  scope; **real applications cannot** — so only real applications justify extraction.

**Every extracted capability records a _promotion rationale_** (the application code
that earned it). **Every deferred capability records a _promotion trigger_** (the
concrete condition that will justify extraction). Both live in the
[Capability Evolution Roadmap](../CAPABILITY-EVOLUTION-ROADMAP.md). A capability may not
enter the shared layer without a rationale; a candidate may not be deferred without a
trigger. This is standing definition-of-done.

**Never build a framework in anticipation of applications.** No registries, discovery
services, routing engines, or plugin systems are added until a real application
demonstrates it cannot proceed without one. The goal is genuine platform capabilities,
not another framework.

---

## Article V — Provider abstraction (the capability-first law)

Learned independently by KCSI-01 *and* AIMPOS, and therefore elevated to law:

1. **Callers express intent, not engines.** A consumer asks for a capability (and,
   where it matters, a **quality tier** — e.g. draft / standard / max), never a
   provider name.
2. **A router selects the provider** from what is configured and healthy. Selection is
   allowed to consider health, cost, latency, and quality **only when a real
   application needs that discrimination** — until then, selection is the app’s
   one-line config choice.
3. **Fallback is within a capability, never across capabilities.** If the preferred
   provider fails or returns an unusable result, degrade to another provider *of the
   same capability* (or the deterministic reference). **Never silently substitute a
   different capability** (a full-presenter is never quietly downgraded to a lip-sync).
   Fail *closed and loud* when a capability genuinely cannot be served.
4. **Every result is attributable.** Output records which provider/version produced it,
   so lineage and trust remain explainable.
5. **Adapters are resilient by default.** Every provider call is idempotent where
   possible, bounded by timeout, retried with backoff on transient failure, and
   observable — because cross-service `503`s are normal, not exceptional.

The KMOS `withFallback` primitive (KCSI-01) is the minimal expression of #3; the
quality-tier and resilience dimensions (#1, #5) are the evidenced next refinements.

---

## Article VI — Knowledge, evidence, and provenance are permanent

The value ordering is constitutional and shared across every system studied:

- **Knowledge is the permanent asset; media, applications, and AI are replaceable.**
- **Provenance is immutable.** Once recorded (source, who, when, how), it cannot be
  rewritten. This is a business rule enforced in the model, not a convenience.
- **Lineage is first-class.** Every derived artifact records what it was derived from
  and by which capability/provider — so any output can be traced to its evidence.
- **Storage is tiered behind locators, content is addressable.** The catalog records
  *where* content lives (hot/warm/cold/content-addressed), never assuming one tier;
  durable text/knowledge is preserved even when heavy media is not (the Media Pipeline
  lesson).

Trust is **evidence-decisive and honest**: an ungrounded claim is marked "needs review",
never dressed as trusted.

---

## Article VII — Governed, durable, human-gated work

- **Workflows are durable and deterministic.** Coordination is replayable; all side
  effects live in activities/adapters. State survives restart by replay, not by hidden
  in-memory state.
- **AI proposes; humans (or governance) dispose.** For anything published or
  distributed, AI output lands as a *proposal*; a governance/approval step promotes it.
  No unapproved AI output reaches distribution. Disclosure and consent, where relevant,
  are recorded before generation.
- **Every decision is explainable and audited.** Approvals, rejections, and policy
  outcomes are immutable events with human-readable reasons.

---

## Article VIII — Deployment: Olares-first, portable, immutable

- **Olares is the reference target; verification on the real estate is authoritative.**
  "Passes locally" is necessary, not sufficient.
- **Portable by construction.** No hardcoded cluster IPs, DNS, or namespaces; every
  endpoint, credential, and tier is env/values-configured. The same artifact runs on
  vanilla K8s or cloud by changing adapters/values only.
- **Immutable images; secrets injected at install.** Production code is baked into
  versioned images; secrets never live in git or images. A factory reset is a *rebuild
  from a runbook*, not a re-troubleshooting exercise.
- **Resilience and health are contracts.** Every deployable exposes health +
  dependency probes; every cross-app call is retry-safe; network isolation is designed
  around (shared services, providers, supported out-of-band tools), not fought.
- **Operational memory is durable.** Every root-caused failure becomes one guardrail in
  a canonical failure catalog; the rebuild runbook is executable from the document
  alone.

---

## Article IX — How the ecosystem evolves

1. **Applications pull capabilities into existence.** A capability is born inside an
   application, proven by use, and extracted only when a second consumer appears
   (Article IV).
2. **The kernel does not grow speculatively.** Flexibility comes from adapters,
   capabilities, the SDK, and applications — never from expanding the frozen core.
3. **Every change cites the real application need it serves**, and updates the roadmap
   in the same change.
4. **Governance travels with code.** Conventional Commits, ADRs, engineering reviews,
   tests, conformance, and evidence archives are non-optional. Version semantics are
   tracked distinctly for application/code, configuration/profile, and output/contract.
5. **Independent review challenges every extraction.** Architecture, developer
   experience, and maintainability are reviewed before a capability is declared shared;
   honesty about debt is mandatory (name what fails, don’t hand-wave).

---

## Article X — What must never change

These are the ecosystem’s fixed stars. Changing any of them is not evolution; it is a
different system:

1. Knowledge/evidence outlive applications, media, and AI.
2. The event log is the system of record; read models are projections.
3. Canonical types are singular and frozen; nothing redefines them.
4. Business logic lives only in capabilities; applications stay thin.
5. Providers are replaceable and invisible to applications.
6. Provenance is immutable; lineage is first-class; trust is honest.
7. Extraction is evidence-first; abstraction is never built ahead of demand.
8. Governance, attribution, and explainability are built in, not bolted on.

Everything else — providers, models, media engines, cloud platforms, UIs, even whole
applications — is expected to change, and the architecture exists precisely so that it
can, without disturbing the eight fixed stars above.

---

## Article XI — The Future Platform Rule (permanent)

_Adopted at the close of Platform Phase 1 (EPT-01 / ADR-0018), the distilled lesson of every
initiative that built this ecosystem:_

> **No platform enhancement shall be undertaken unless demanded by a real application or
> supported by clear evidence from multiple applications.**

This makes explicit and permanent what Articles IV and IX already imply. It governs the
Product Era: the platform and capability layer are mature, and future primary investment
targets **applications**. Platform effort is reserved for **demand-pulled** work — capability
extraction on second-consumer evidence, provider adapters a real product needs, and
operations — never speculative growth, new frameworks, or redesign. Every proposed platform
change must cite the real application requirement it serves; absent that, the answer is no.

The kernel stays frozen; capabilities grow only on evidence; simplicity is defended by
default. If a future change cannot name the product that needs it, it is not built.

---

_Ratification: proposed under KEAI-01 (2026-07-01). Companion documents: the
[Ecosystem Capability White Paper](KEAI-01-ECOSYSTEM-CAPABILITY-WHITEPAPER.md),
[Capability Inventory](KEAI-01-CAPABILITY-INVENTORY.md), and
[Ecosystem Development Guide](KEAI-01-ECOSYSTEM-DEVELOPMENT-GUIDE.md). This constitution
is intended to be short and durable; when it and a companion document disagree, this
document and the platform constitution win._
