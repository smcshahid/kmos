# KMOS Platform Vision

**Audience:** owners, architects, and prospective product teams deciding what to
build **on** KMOS.
**Scope:** what the platform *is*, the constitutional architecture and its
rationale, what belongs in each layer, and the products intended to be built on
top of it.
**Authority:** the specification corpus is supreme — `constitution/` (KMOS-9999
Implementation Constitution, KMOS-10005 Product Vision & Engineering Charter) and
the numbered specifications. This document interprets that corpus; where they
disagree, the specs win.

> **Status (2026-06-30):** KMOS `1.0.0-rc.1`. This is a vision document. It
> distinguishes throughout between what is **built and verified** and what is
> **intended (roadmap)**. Consumer products named below are **intended
> consumers**, not delivered features.

---

## 1. What KMOS is

KMOS — the **Knowledge & Media Operating System** — is an operating system for an
institution's permanent knowledge and media. Its founding premise (KMOS-9999,
KMOS-10005) is a deliberate ordering of value:

> **Knowledge is the permanent institutional asset. Media, applications, and AI
> are replaceable representations and tools.**

Every business change is recorded as an immutable **canonical event** — a
past-tense fact. **Knowledge Objects** carry authoritative meaning, **Assets**
carry authoritative evidence, and graphs and search indexes are **projections**
that can always be rebuilt by replaying the event log. **Identity** makes every
actor accountable; **Governance** makes every decision explainable. This is what
"operating system" means here: KMOS is not an application, it is the substrate
that applications run on and are replaceable above.

KMOS is a **platform, not an application**. It ships as a monorepo of **28
workspace packages** (Node 22+, TypeScript strict, npm workspaces) organized as a
**modular monolith** with strict ports-and-adapters boundaries, so that any
replaceable technology (storage, broker, identity provider, AI model) sits behind
a port and any product can be built above the core without forking it.

---

## 2. The constitutional architecture — and why

KMOS is organized **strictly by architectural concept, not by technology**
(KMOS-10020). Top-level directories map one-to-one onto layers, and imports may
only point **down** the stack:

```
applications  →  domains / connectors  →  capabilities / sdk
              →  engines / platform     →  packages (canonical-kernel)
```

This dependency direction is not a convention — it is **enforced automatically**
by `tools/fitness-checks/run.mjs`, which rejects any `@kmos/*` import that points
up the stack (see `documentation/ARCHITECTURE.md` §2 and `GOVERNANCE-MODEL.md`).

**Why this shape.** The ordering protects the value ordering. Knowledge and its
canonical types live at the bottom, where nothing can corrupt them and everything
must depend on them; replaceable technology lives at the edges, behind ports, so
"technology is replaceable" is a structural fact rather than an aspiration. A
product team can therefore build on KMOS confident that the meaning of the
institution's knowledge does not change when the database, the broker, the model,
or the UI does.

---

## 3. What belongs where

| Layer | Directory | What belongs here | What must NOT go here |
|---|---|---|---|
| **Canonical kernel** | `packages/canonical-kernel` | The single source of truth: canonical object envelope, event envelope, the authoritative event catalog, append-only `EventLog` port + in-process bus + replay, security primitives (`CallContext`/`Authorizer`), a dependency-free validator. **Zero runtime dependencies.** | Any infrastructure import (`pg`, brokers), any business logic, anything from an upper layer. |
| **Engines / platform** | `engines/`, `platform/` | The seven Foundational Institutional Engines + **Configuration** + **Search** as in-process services; observability; the merged platform-catalog. Canonical mechanism, not domain journeys. | Cross-service internal imports (services talk via canonical events + business APIs only). |
| **Capabilities / SDK** | `capabilities/`, `sdk/` | **All business logic**, behind published contracts (transcription, translation, knowledge-extraction, rendering, …). The SDK is the extension surface (`sdk/` is currently scaffolding — roadmap). | Transport concerns; direct storage access outside an `infrastructure/` adapter. |
| **Domains / connectors** | `domains/`, `connectors/` | Orchestration of capabilities and services into institutional journeys (media, language, publishing, preservation, ai-collaboration); adapters that translate external systems into canonical events. | Business computation (that lives in capabilities); redefinition of canonical types. |
| **Applications** | `applications/` | **Thin** views/facades that read through services and present them (knowledge-studio, research-portal, archive-explorer, administration, public-api, learning-platform). | Any business rule; any canonical-type redefinition. |
| **Extensions** | `extensions/` | Third-party contributions gated by the Conformance Kit. **Scaffolding today — roadmap**; no example extension ships yet. | — |

The rule that makes this durable is constitutional: **canonical types are
sacred** — every service imports canonical objects, the event envelope, schemas,
and the catalog from `@kmos/canonical-kernel` and **none redefine them** (Coding
Constitution §3; ADR-0002). New canonical types are added to the kernel through
review, never ad hoc.

---

## 4. The platform-not-application philosophy

Three commitments distinguish KMOS from an application that merely uses a database:

1. **The log is the system of record; read models are projections.** The
   knowledge graph and search indexes are never authoritative — they are folded
   from the immutable event log and can be rebuilt at any time by replay. This is
   what makes institutional memory reconstructable.
2. **Replaceability is enforced, not documented.** Every replaceable technology
   sits behind a port, and the **Conformance Kit** (`@kmos/conformance`,
   ADR-0007) turns those ports into published, versioned contracts that any
   implementation must satisfy to claim compliance. Products and third parties can
   grow the ecosystem without eroding the core.
3. **Accountability and explainability are built in.** Attribution flows through
   an ambient `CallContext` and is stamped at the event chokepoint; governance
   decisions carry human-readable reasons. (Pervasive enforcement across every
   write path and real authentication against an IdP are **roadmap** — see §6.)

---

## 5. Products intended to be built on KMOS

KMOS is the substrate; the following are the **intended consumer products** it is
designed to carry. They are **not delivered features of this release** — they are
the reason the platform exists and the demand it is shaped to meet. The reference
apps in `applications/` are thin demonstrations of these product shapes, not the
products themselves.

- **MuhammadanWay** — a knowledge/media product over the institutional core
  (the motivating first-party consumer).
- **Media Pipeline** — ingestion, transcription, translation, and rendering of
  media into canonical knowledge and evidence.
- **Research** — discovery, lineage, and provenance across the knowledge graph.
- **Publishing** — governed release of knowledge with approval workflows.
- **Learning** — structured learning experiences over canonical knowledge.
- **AI Assistants** — AI as a **capability** behind a port (KMOS-0008: AI is a
  replaceable capability, never the system of record), operating on canonical
  knowledge with full attribution and governance.

Each of these is expected to be built as **capabilities + domains + a thin app**
above an unchanged core, and to certify against the Conformance Kit. That is the
test of the platform: multiple products, one canonical foundation, no forks.

---

## 6. Honest boundary: intended vs. built

To keep this vision grounded, the current dividing line (per
`engineering/review/15-GENERAL-AVAILABILITY-ASSESSMENT.md`):

- **Built and verified:** the canonical kernel with an **async** `EventLog` port
  validated against **real PostgreSQL in CI** (KEP-001 / ADR-0009); the seven
  engines + Configuration + Search; capabilities → domains → thin apps; the
  Conformance Kit; ambient attribution mechanism (`CallContext` via
  `AsyncLocalStorage`) with the bus stamping actor/organization; architecture
  fitness enforcement.
- **Scaffolding / roadmap (explicitly not production-validated):** read-model
  persistence is still **in-memory behind ports** (only the EventLog
  system-of-record is real-PG-validated); authentication is a documented **seam**
  with no real OIDC validated against a real IdP; no real cluster, tracing
  backend, or secrets backend in this environment; the `sdk/` and `extensions/`
  surfaces are thin; the consumer products in §5 are intended, not implemented.

The platform is real; the substrate underneath the full product story is being
hardened stage by stage. See `RELEASE-LIFECYCLE.md` for how those stages are
gated.
