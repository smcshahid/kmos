# The KMOS Book

**The definitive engineering handbook for the Knowledge & Media Operating System.**

_If you are a new engineer — human or AI — read this book. It is the primary entry point to
the entire ecosystem: why KMOS exists, how it is built, how to extend it, how to operate it,
and how it evolves. You should be able to understand and run KMOS from this book and the
documents it links, **without any historical conversation context.**_

_Version 1.0 · 2026-07-01 · authored under ESRI-02. This book references the authoritative
detail docs ([Documentation Index](README.md)); it is the coherent narrative, they are the
depth._

---

## Table of contents

- **Part I — Vision:** why KMOS exists, philosophy, evidence-first engineering, constitutional
  architecture, ecosystem evolution, lessons learned.
- **Part II — Architecture:** core, capability layer, applications, infrastructure, boundaries,
  fitness, event sourcing, governance, identity, trust, lineage.
- **Part III — The Capability Layer:** why it exists, evolution, provider independence, the
  adapter pattern, extraction, promotion rationale, deferred capabilities.
- **Part IV — Building Applications:** how to build one, best practices, SDK, capabilities,
  Olares, provider configuration, testing, deployment, review.
- **Part V — Operations:** Docker, GitHub Actions, CI, releases, versioning, publishing,
  Docker Hub, Olares, recovery, upgrade, rollback, backups.
- **Part VI — Governance:** constitution, ADRs, engineering reviews, capability evolution,
  repository and release standards, manual-testing philosophy.
- **Part VII — Future:** roadmap, ten-year vision, how the ecosystem evolves, how to propose
  architectural change.

---

# Part I — Vision

## Why KMOS exists

KMOS is an **operating system for an institution's permanent knowledge and media**. Its
founding premise is a deliberate ordering of value: **knowledge is the permanent asset;
media, applications, and AI models are replaceable representations and tools.** Platforms
that treat an application or a database as the system of record lose their knowledge when the
technology turns over. KMOS inverts that: knowledge, evidence, and provenance are the durable
core, and everything above them — apps, providers, clouds, models — is expected to change
without disturbing it.

## Philosophy

Nine principles order every decision (KMOS-9999): *Knowledge before Applications · Evidence
before Files · Capabilities before Services · Events before Integration · Workflow before
Automation · Governance before Publication · Identity before Permissions · Trust before
Optimization · Business Meaning before Technology.* They are not slogans — they are the tie-
breakers when two designs compete.

## Evidence-first engineering

The single most important operating rule of the ecosystem: **build on evidence, never
speculation.** New capabilities are extracted only when a real application proves the need
(and, for shared capabilities, a *second* consumer appears). Every abstraction cites the
application code that justified it; nothing is built "just in case." This rule (ADR-0012) is
why the platform stayed small and comprehensible through five initiatives — and why it is
trustworthy. See Part III.

## Constitutional architecture

KMOS is organized **strictly by architectural concept, not technology**. Top-level directories
map one-to-one onto layers, and imports may only point **down** the stack. This is not a
convention — it is machine-enforced by `tools/fitness-checks/run.mjs`. The value ordering is
protected structurally: canonical knowledge lives at the bottom where nothing can corrupt it;
replaceable technology lives at the edges behind ports. See Part II and the frozen
[Ecosystem Constitution](ecosystem/ECOSYSTEM-CONSTITUTION.md).

## Ecosystem evolution

KMOS grew in disciplined initiatives, each evidence-driven and independently reviewed:
**v1.0 GA** (the platform) → **KCSI-01** (first capability extraction: providers, fallback,
SDK) → **KEAI-01** (ecosystem architecture + constitution, from studying prior systems) →
**KCSI-02** (Podcast Studio + content-projections extraction) → **ESRI-01** (provider
configuration + operational readiness) → **ESRI-02** (this book + verified release
engineering). Each is recorded as an ADR + an engineering review; the
[Capability Evolution Roadmap](CAPABILITY-EVOLUTION-ROADMAP.md) tracks what was extracted, why,
and what is deferred.

## Lessons learned (from KMOS and prior systems)

Studying four independently-built systems (KMOS, Knowledge Studio, AIMPOS, Media Pipeline)
revealed a **convergent architecture** — the same shape the problem keeps forcing:

1. Canonical catalog/log is the system of record; graphs, search, and read models are
   rebuildable projections.
2. Provenance is immutable; lineage is first-class; trust is honest (never a bare score).
3. **Capability-first provider abstraction beats plugin registries** — callers express intent,
   a router/config picks the engine, fallback stays *within* a capability, fail closed.
4. Workflows are durable and deterministic; AI proposes, humans/governance dispose.
5. Deploy Olares-first but portable; immutable images; secrets injected at install.
6. Governance travels with code; honest technical debt beats hidden debt.
7. **Avoid premature abstraction** — the failure mode the whole discipline exists to prevent.

Full analysis: [Ecosystem Capability White Paper](ecosystem/KEAI-01-ECOSYSTEM-CAPABILITY-WHITEPAPER.md).

---

# Part II — Architecture

## The four layers

```
Applications        thin: user journeys, UI/API, orchestration, provider selection, composition
     ↓
Capability layer    ALL business work behind stable contracts; providers swap underneath
     ↓
KMOS platform       knowledge · evidence/assets · identity · governance · events · workflow · search
     ↓
Infrastructure      Olares / K8s / cloud · PostgreSQL · object store · IPFS · model runtimes
```

Dependencies point **down only**. In the monorepo this is enforced by fitness ranks
(`packages 0 · engines/platform 1 · capabilities/sdk 2 · connectors/domains 3 ·
applications 4 · products 5`); an import to a higher rank fails CI.

## KMOS Core

The **canonical kernel** (`packages/canonical-kernel`, frozen — ADR-0002/0012) is the single
source of truth: the canonical object envelope, the event envelope + catalog, the append-only
`EventLog` port + in-process bus + replay, security primitives (`CallContext`/`Authorizer`),
and a dependency-free validator. **Zero runtime dependencies.** Nothing redefines canonical
types. The seven Foundational Engines + Configuration + Search are the platform services on
top (`platform/*`, `engines/*`).

## Capability layer & Applications

All business work lives in **capabilities** behind published contracts; **domains** compose
capabilities into journeys; **applications** are thin (orchestration + UI). Details in
Part III and Part IV.

## Infrastructure

Every replaceable technology (PostgreSQL, object storage, IPFS, model runtimes, IdP) sits
**behind a port**, realized by an adapter under an `infrastructure/` directory. The Conformance
Kit ([CONFORMANCE](CONFORMANCE.md)) turns those ports into versioned contracts any
implementation must satisfy.

## Architectural boundaries & fitness rules

Enforced automatically ([ARCHITECTURE](ARCHITECTURE.md) §2): (1) dependency direction
(down-only); (2) no cross-service internal imports (services talk via events + business APIs);
(3) kernel purity (no infra imports); (4) infra drivers only under `infrastructure/`;
(5) await-everywhere publication (no fire-and-forget canonical emits). `npm run fitness` → 0
violations is a release gate.

## Event sourcing

The immutable **event log is the system of record.** Every business change is a past-tense
canonical event; read models (knowledge graph, search, app catalogs) are **projections** that
rebuild by replay. Events are state-carried so services rehydrate on boot (ADR-0011) — a
restarted deployment serves identical knowledge, lineage, and trust.

## Governance, Identity, Trust, Lineage

**Identity** makes every actor accountable (ambient `CallContext`, attribution stamped at the
event chokepoint). **Governance** makes every decision explainable (approvals with human-
readable reasons; AI proposes, governance disposes). **Trust** is evidence-decisive and
honest — an ungrounded claim is marked "needs review," never dressed as trusted. **Lineage**
records what each artifact was derived from and by which capability/provider, so any output
traces to its evidence. Detail: [GOVERNANCE-MODEL](GOVERNANCE-MODEL.md), [SECURITY-REVIEW](SECURITY-REVIEW.md).

---

# Part III — The Capability Layer

## Why it exists

Applications come and go; the work they do (transcribe, translate, extract knowledge, render,
package) recurs. The capability layer is where that work lives **once**, behind a stable
contract, so every application composes it instead of reimplementing it, and so providers can
change without touching applications.

## How capabilities evolve (build first, extract second)

A capability is **born inside an application**, proven by use, and **extracted only when a
second real consumer appears** and it passes the tests: contract-stable, provider-replaceable,
cross-application, kernel-only, deterministic-core (Constitution Art. II/IV). Extraction
refactors *both* consumers onto the shared capability and proves behavior is unchanged. This is
the exact sequence KCSI-01 and KCSI-02 followed.

## Provider independence & the adapter pattern

Callers express **intent** (a capability, optionally a quality tier), never an engine. A small
**config model + factory** selects a provider adapter; **`withFallback`** degrades within a
capability to a deterministic reference on any failure. There is **no** provider registry or
orchestration framework — that would be premature abstraction. Switching AI providers (Ollama
↔ OpenAI/Azure/Groq/…) is a **configuration change, not code**. Full detail + the provider
matrix: [AI Provider Architecture & Configuration](PROVIDER-GUIDE.md).

## Extraction, promotion rationale, deferred capabilities

The [Capability Evolution Roadmap](CAPABILITY-EVOLUTION-ROADMAP.md) is the living record: every
**extracted** capability carries a **promotion rationale** (the app evidence that earned it);
every **deferred** capability carries a **promotion trigger** (the concrete condition that will
justify extraction). Extracted so far: `withFallback`, `@kmos/providers` (Ollama + OpenAI-
compatible knowledge extraction, HTTP ASR), `@kmos/sdk` (platform substrate),
`@kmos/content-projections` (transcript/chapters/evidence). Deferred with triggers: media/
ffmpeg, translation providers, subtitles/summary/moments/clips/publishing (single-consumer),
and — emphatically — any registry/routing framework (no evidence). Inventory:
[Capability Inventory](ecosystem/KEAI-01-CAPABILITY-INVENTORY.md).

---

# Part IV — Building Applications

**Read the [Ecosystem Playbook](ecosystem/ECOSYSTEM-PLAYBOOK.md) — it is the operational
how-to; this is the summary.**

1. **Scaffold** to the [Packaging Standard](PACKAGING-STANDARD.md) (copy Knowledge Studio /
   Podcast Studio).
2. **Compose the substrate** with `@kmos/sdk` (`createPlatformRuntimeFromEnv`) — knowledge,
   assets, governance, events, workflow, search, identity, config + boot recovery, for free.
3. **Orchestrate capabilities** via domains + the Workflow Service. No business logic in the
   app; no canonical-type redefinition.
4. **Inject providers by configuration** from `@kmos/providers` — never name an engine
   ([Provider Guide](PROVIDER-GUIDE.md)).
5. **Reuse shared capabilities** (`@kmos/content-projections`, reference capabilities).
6. **Test** (deterministic cores offline; adapters against a double; E2E on the real target;
   fitness + conformance in CI) and **document** (README + ARCHITECTURE).
7. **Deploy** Olares-first, portable ([DEPLOYMENT](DEPLOYMENT-GUIDE.md), [OLARES](OLARES-DEPLOYMENT-GUIDE.md)).
8. **Review + release** via the KCSI cadence (Part VI) and only then request manual validation.

Best practices, SDK, and review detail: [Development Guide](ecosystem/KEAI-01-ECOSYSTEM-DEVELOPMENT-GUIDE.md),
[SDK Strategy](ecosystem/KEAI-01-SDK-STRATEGY.md). Worked examples: `products/knowledge-studio`,
`products/podcast-studio` (each with README + ARCHITECTURE).

---

# Part V — Operations

**Authoritative detail: [Release & Docker](RELEASE-AND-DOCKER.md), [RELEASE-LIFECYCLE](RELEASE-LIFECYCLE.md),
[OPERATIONS-GUIDE](OPERATIONS-GUIDE.md), [OLARES-DEPLOYMENT-GUIDE](OLARES-DEPLOYMENT-GUIDE.md),
[UPGRADE-GUIDE](UPGRADE-GUIDE.md), [BACKUP-AND-RESTORE](BACKUP-AND-RESTORE.md),
[DISASTER-RECOVERY](DISASTER-RECOVERY.md).**

- **CI (GitHub Actions, `ci.yml`):** on every PR + main push — `static` (lint · fitness ·
  typecheck · audit), `tests` (unit · contract · security · integration · perf · certification
  · conformance · demo), and `database` (the EventLog contract against real PostgreSQL). All
  green is a release gate. `npm ci` requires `package-lock.json` in sync (regenerate the lock
  when workspace packages change — ESRI-02 lesson).
- **Docker & release:** every deployable has a **self-verifying** Dockerfile (`npm run verify`
  at build) and a tag-triggered release workflow that builds `linux/amd64`, publishes to
  Docker Hub, and — via the automated release workflow — packages the Olares Application Chart
  `.tgz` and creates a **GitHub Release** with the chart, notes, and checksums as the
  authoritative download. Pin `:<semver>` (never `:latest`) in deployment manifests.
- **Versioning:** track three versions independently — application/code, config/profile,
  output/contract ([VERSIONING-AND-COMPATIBILITY](VERSIONING-AND-COMPATIBILITY.md)).
- **Olares:** Application Chart (Helm + `OlaresManifest.yaml`) consuming Olares-provided
  PostgreSQL; FQDN discovery; `entrance.host` == Service == release name; secrets at install.
- **Recovery / upgrade / rollback / backup:** durable log is the source of record; read models
  rebuild by replay; redeploy a prior pinned image / `helm rollback` to roll back; pg_dump/
  restore drills for data.

---

# Part VI — Governance

- **Constitution:** the platform [Coding/Implementation Constitution](../constitution/) (frozen)
  and the [Ecosystem Constitution](ecosystem/ECOSYSTEM-CONSTITUTION.md) (principles for the
  layers above the kernel). Higher documents win.
- **ADRs:** every architectural decision is an ADR ([index](adr/README.md)), distilled from the
  living [DECISIONS log](../engineering/DECISIONS.md). Adding an ADR updates the index +
  DECISIONS in the same change.
- **Engineering reviews:** each initiative closes with an independent review under
  `engineering/review/` (architecture / DX / maintainability / security / …) and an honest
  proven/deferred assessment.
- **Capability evolution:** rationale-per-extracted, trigger-per-deferred, in the roadmap
  (standing definition-of-done).
- **Repository & release standards:** Conventional Commits; feature branch → PR; immutable
  images; secrets at install; one authoritative doc per topic ([Documentation Index](README.md)).
- **Manual-testing philosophy:** human validation is the **final** step, only after every
  automated gate is green, and focuses on experience, not correctness
  ([Manual Testing Philosophy](MANUAL-TESTING-PHILOSOPHY.md), [Release Readiness Checklist](RELEASE-READINESS-CHECKLIST.md)).

---

# Part VII — Future

- **Roadmap:** application-focused development is now the primary investment. Capabilities are
  pulled into existence by real applications; the roadmap records what waits and why.
- **Ten-year vision:** providers, models, media engines, clouds, and whole applications change;
  the knowledge core and capability contracts stay stable. A developer in 2036 builds a new
  KMOS app by composition, without knowing which engine transcribes or reasons. Full text:
  [Ten-Year Vision](ecosystem/KEAI-01-TEN-YEAR-VISION.md).
- **How the ecosystem evolves:** demand-pulled, evidence-first, kernel frozen. The next likely
  capability initiative is a **media-provider** pass (real ffmpeg/translation/preservation) —
  pulled when a media-heavy application (Media Pipeline) is built on KMOS, not before.
- **How to propose architectural change:** open an ADR citing the real application need; run
  the KCSI cadence (propose → review → build → record → close out); for any kernel change,
  the KMOS-9999 §20 kernel-migration review + owner approval. Never redesign speculatively;
  demand extraordinary evidence for any change to the eight fixed stars (Constitution Art. X).

---

_This book is the map. When it and a detail document disagree, the platform constitution and
the specification corpus win. Keep this book current as the ecosystem evolves — it is the first
thing a future engineer reads._
