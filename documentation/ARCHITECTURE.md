# KMOS Architecture Guide

**Audience:** engineers, architects, and reviewers who need an accurate mental
model of the KMOS reference implementation.
**Scope:** the structure that exists in this repository today, and an honest
account of what is realized in-process versus what is gated to a real CI / cloud
environment.
**Authority:** the KMOS specification corpus is supreme — `constitution/`
(KMOS-9999, KMOS-10005, KMOS-10020, KMOS-10030, KMOS-10040, KMOS-10050) and the
numbered specifications (KMOS-0001..0010, KMOS-0100..0200, KMOS-0201..0210).
This document describes how the code realizes those specs; where they disagree,
the specs win.

> **Status (2026-06-30):** Reference implementation, milestones M0–M6 certified.
> The platform is **library-grade**: in-process services composed in one process,
> reached through programmatic facades, with a runnable end-to-end demo
> (`npm run demo`). There is **no HTTP server and no UI yet**, and all
> persistence is **in-memory behind ports**. See §10 (Current realization vs.
> production target) and `engineering/IMPLEMENTATION_STATUS.md`.

---

## 1. The architectural idea in one paragraph

Knowledge is the permanent institutional asset; media, applications, and AI are
replaceable representations and tools. Every business change is recorded as an
immutable **canonical event** — a past-tense fact. **Capabilities** hold all
business logic; the **Workflow Service** coordinates work but never computes it.
**Knowledge Objects** are the authoritative meaning, **Assets** are the
authoritative evidence, and graphs and search indexes are **projections** that
can always be rebuilt by replaying the event log. **Identity** makes every actor
accountable; **Governance** makes every decision explainable. Applications are
thin views over services. Technology is replaceable because it sits behind
**ports**.

---

## 2. Layer model and the dependency-direction rule

KMOS is a **modular monolith** (decision D-C) organized strictly by
architectural concept, not by technology (KMOS-10020). Top-level directories map
one-to-one onto layers, and imports may only point **down** the stack.

| Rank | Layer (directory)            | Contains                                                                 |
|------|------------------------------|--------------------------------------------------------------------------|
| 0    | `packages/`                  | `canonical-kernel` — the single source of truth                          |
| 1    | `engines/`, `platform/`      | the seven engines + Configuration + Search; observability; platform-catalog |
| 2    | `capabilities/`, `sdk/`      | business-logic units behind published contracts                          |
| 3    | `domains/`, `connectors/`    | domain orchestration; external-system adapters                           |
| 4    | `applications/`              | thin views / facades                                                     |

**The dependency-direction rule** (`applications → domains/connectors →
capabilities → engines/platform → packages`) is enforced by
`tools/fitness-checks/run.mjs`. The checker discovers the owning layer of every
`@kmos/*` workspace package by reading each package's `package.json` "name",
then rejects any import that points to a higher rank. It enforces four
invariants:

1. **Dependency direction** — for every `@kmos/*` import, not just the kernel
   (this closed review finding HIGH-3).
2. **No cross-service imports** — a `platform/` service may not import another
   platform service's internals; cross-service contact is events + business APIs.
3. **Kernel purity** — `packages/canonical-kernel` imports no infrastructure
   (`pg`, `kafkajs`, `nats`, …) and nothing from upper layers.
4. **Ports-and-adapters** — infrastructure modules may only be imported inside an
   `infrastructure/` directory.

At the certified baseline the checker reports **0 violations** across 131 source
files / 26 workspace packages.

---

## 3. The canonical kernel (`packages/canonical-kernel`)

The kernel (decisions D-005, D-F) is the **zero-runtime-dependency** heart of the
platform. Every service imports its canonical types from here and **none redefine
them** (KMOS-9999 §7). Source files:

| File                          | Responsibility                                                        |
|-------------------------------|-----------------------------------------------------------------------|
| `identifiers.ts`              | Permanent canonical ids of the form `kmos:<Type>:<uuid>` (KMOS-0100 §6)|
| `lifecycle.ts`                | The 10-state canonical lifecycle + allowed transitions (KMOS-0100 §7)  |
| `canonical-object.ts`         | The common object envelope; one owning service per type (KMOS-0100/10030)|
| `event-envelope.ts`           | The 3-section canonical event envelope (KMOS-0110/10040)               |
| `security.ts`                 | `CallContext`, `Authorizer`, `ALLOW_ALL` (KMOS-0190/0206)              |
| `errors.ts`                   | The canonical error taxonomy + retryability (KMOS-0120/0180)          |
| `schema/validate.ts`          | A deterministic, dependency-free JSON-Schema-style validator (D-F)     |
| `schema/envelope-schema.ts`   | The event-envelope schema enforced before publication                 |
| `schema/event-catalog.ts`     | The single authoritative event catalog (97 types)                     |
| `schema/object-schemas.ts`    | Canonical object schemas                                              |
| `event-bus/append-log.ts`     | The `EventLog` port + `InMemoryEventLog` append-only implementation    |
| `event-bus/bus.ts`            | The in-process `EventBus` (validate → append → dispatch)              |
| `event-bus/replay.ts`         | The first-class replay engine                                        |

### 3.1 Canonical objects

Every persistent business object exposes a common structure
(`CanonicalObject<T>`): a permanent `id`, `type`, `schemaVersion`, an
authoritative `owner` (one of nine owning services), a monotonic `version`, a
canonical `lifecycle` state, timestamps, optional `organizationId` (tenant),
explicit **by-identifier** `relationships`, `governance` metadata, and an
owner-interpreted `body`. The kernel never interprets the `body`; only the owning
service does. Identity is independent of storage — ids are never derived from
filenames, database keys, or URLs.

### 3.2 The three-section event envelope

A `CanonicalEvent<P>` (KMOS-0110 §5) has exactly three logical sections:

- **Identity** — `eventId`, `type` (BusinessObject + PastTenseVerb, e.g.
  `AssetRegistered`), `schemaVersion`, `time`, `producer`, the
  **correlation/causation** triplet (`correlationId` groups a whole business
  transaction; `causationId` points at the directly-causing event — Greg Young
  rules), `organizationId` (tenant), `actorId` (attribution), and `subjectId`.
- **Payload** — the event-type-specific business body; references canonical
  identifiers only and carries no infrastructure metadata.
- **Governance** — workflow/execution/capability ids, related assets/knowledge,
  approval status, security classification, evidence and lineage refs.

`createEvent()` applies the correlation/causation rules automatically: when an
event is `causedBy` another, it inherits the correlation id and sets its
causation id; a root event's correlation id defaults to its own event id.

### 3.3 The single event catalog (97 types)

`schema/event-catalog.ts` is the authoritative registry of canonical event
**types** and the single source of truth for the platform's event vocabulary
(KMOS-10040; this consolidation addressed review finding MED-5). Each entry
records the type name, its owning service (or `Capability`), its **event class**
(`Institutional`, `Platform`, `Capability`, `Operational` — operational events
must never become institutional history), its schema version, and a category.
The seed declares **97 event types** spanning Knowledge, Asset, Event Service,
Workflow, Capability (registry + runtime), Identity, Governance, Configuration,
Search, capability-execution, and domain events. Only events registered in the
catalog may be published; the bus rejects unregistered types and version
mismatches before anything reaches the log.

> Composition note: `engines/platform-catalog` unions the kernel seed with each
> service's local catalog extension for single-shared-bus deployments. The kernel
> catalog remains the authority; folding the per-service extensions fully into the
> kernel is tracked cleanup (KNOWN_ISSUES M1-02).

### 3.4 Append-only log, in-process bus, replay

- **`EventLog` (append-only).** `InMemoryEventLog` models the production
  PostgreSQL design: per-stream version with **optimistic concurrency**
  (`UNIQUE(stream_id, version)`) plus a monotonic global sequence for ordered
  replay. History is immutable — events are never updated or deleted.
- **`EventBus`.** `publish()` (1) **validates** the event against the envelope
  schema and the catalog, (2) **enforces** attribution/authorization at the
  chokepoint (see §3.5), (3) **appends** to the log, then (4) **dispatches** to
  subscribers. Delivery is **at-least-once with idempotency**: each subscriber
  processes a given `eventId` at most once, with bounded retry; failed handlers
  become **dead-letters**, never silent drops. A broker (NATS/Kafka) can replace
  the in-process dispatcher behind this same interface.
- **Replay.** `replay()` reads the immutable log in global-sequence order and
  folds events into a pure `Projection<S>`, returning the rebuilt state plus a
  separate `ReplaySession` (run id, range, count, timing). Replay **never mutates
  history** and never re-appends; replay metadata is recorded separately, exactly
  as KMOS-0203 §14 requires. This is what makes institutional memory
  reconstructable — the disaster-recovery test rebuilds all state purely by
  replaying the log.

### 3.5 Security primitives (CallContext / Authorizer)

`security.ts` defines kernel-level contracts so attribution and authorization can
be applied uniformly at the event chokepoint (KMOS-0190, KMOS-0206):

- **`CallContext`** — the authenticated `actorId`, optional `organizationId`
  (tenant), and optional `permissions`.
- **`Authorizer`** — a Policy Decision Point; `authorize(event, context)` returns
  an allow/deny decision with a reason. `ALLOW_ALL` is the default
  (non-enforcing) authorizer.
- **Enforcing mode.** The bus can be constructed with `requireActor: true` and a
  real `Authorizer`; it then rejects any unattributed event and any event a
  policy denies. The default composition is non-enforcing so the library-grade
  reference runs without an IdP. **Pervasively threading `CallContext` through
  every write path is gated to CI** (review CRIT-2 / KEP-001 Stage 7).

---

## 4. Ports and adapters

Every service core depends on **ports** (interfaces) and keeps concrete adapters
under an `infrastructure/` directory (decision D-006). For example,
`platform/knowledge` defines a `VersionedRepository` port (knowledge is immutable
and versioned — updates append a new version, history is preserved) with an
in-memory adapter in `infrastructure/`. Storage, broker, IdP, secret backends,
and AI/media model handlers are all ports. This is the mechanism by which
"technology is replaceable": the `platform/events` Postgres `EventLog` adapter
and its `EVENTS_TABLE_DDL` exist and are contract-tested against a fake
`SqlClient`, demonstrating storage replaceability behind the kernel port without
importing `pg` outside an `infrastructure/` directory.

> Known contract gap (review CRIT-1): the kernel `EventLog` port is currently
> **synchronous**, while real storage is asynchronous, so the Postgres adapter
> today satisfies a separate async interface. Converging the kernel port onto a
> single async contract is the subject of **KEP-001** (see §10 and
> `engineering/review/07-KERNEL-EVOLUTION-PLAN.md`).

---

## 5. The seven engines + Configuration + Search

The seven Foundational Institutional Engines are the permanent foundation;
Configuration and Search complete the canonical platform core (decision D-004).
All live under `platform/` (10 services).

| Service                 | Spec       | Owns / does                                                                 |
|-------------------------|------------|----------------------------------------------------------------------------|
| Knowledge               | KMOS-0201  | Canonical Knowledge Objects; immutable versions; first-class relationships; multilingual vocabulary; graph **as a projection** |
| Asset Registry          | KMOS-0202  | Canonical asset identity independent of storage; versions; provenance; multi-hop lineage; integrity; evidence packages |
| Event                   | KMOS-0203  | Schema registry + BACKWARD compatibility; subscriptions; correlation/causation; replay; dead-letters; transport independence |
| Workflow                | KMOS-0204  | Declarative, deterministic, event-driven coordination; parallel/human/approval/compensation; replay reconstruction (**coordinates, never computes**) |
| Capability Registry     | KMOS-0205  | Manifests; contracts; versioning; certification; dependency graph + cycle detection |
| Identity                | KMOS-0206  | Canonical identities for humans and non-humans; orgs/roles/permissions; delegation; authn behind a port; policy-driven authz |
| Governance              | KMOS-0207  | Versioned policies; multi-mode approvals; certification; compliance; risk; exceptions; **explainable** trust; **immutable** audit |
| Configuration           | KMOS-0209* | Versioned external config; profile overrides; secret references           |
| Capability Runtime      | KMOS-0210* | Contract-bound execution; fault isolation; health; AI-model independence  |
| Search                  | KMOS-0208* | Event-driven projections; keyword + hybrid (RRF); rebuild-by-replay; governance-aware filtering |

`*` KMOS-0208/0209/0210 are agent-authored drafts pending governance review.
Supporting engines: `engines/observability` (metrics/logging/health,
deterministic, zero-dep) and `engines/platform-catalog` (the merged catalog).

---

## 6. Capabilities, domains, applications

- **Capabilities** (`capabilities/reference-capabilities`) hold **all business
  logic** behind published contracts: transcription, translation,
  knowledge-extraction, rendering. Capability-execution events prove that real
  work happens in capabilities, not in workflows or applications.
- **Domains** (`domains/media`, `language`, `publishing`, `preservation`,
  `ai-collaboration`) orchestrate capabilities and services into institutional
  journeys. Domains compose concrete service classes in-process today; when
  services are extracted these call sites become network/business-API calls
  (review finding 4.4 — a recorded migration cost, not a violation).
- **Connectors** (`connectors/connector-framework`) translate external systems
  into canonical events (reference: a WebPageConnector).
- **Applications** (`applications/knowledge-studio`, `research-portal`,
  `archive-explorer`, `administration`, `public-api`, `learning-platform`) are
  **thin**: they read through services and present views. They are verified thin
  and interchangeable.

---

## 7. Event-driven flow

Every business change follows the same backbone:

```
caller → service/domain method
            │  builds a canonical event (createEvent: identity/payload/governance,
            │  correlation+causation applied)
            ▼
        EventBus.publish
            ├─ validate (envelope schema + catalog: type registered, version matches)
            ├─ enforce  (attribution/authorization — no-op unless enforcing mode)
            ├─ append   (immutable, per-stream optimistic concurrency, global sequence)
            └─ dispatch (fan-out to subscribers; at-least-once + idempotent; dead-letter on failure)
                    │
                    ▼
        projections update (knowledge graph, search index) — always rebuildable by replay
```

Read models (the knowledge graph, search indexes) are **never the system of
record** (assumption A-03): they are projections folded from the log and can be
rebuilt at any time. Event delivery is at-least-once and all consumers are
idempotent (assumption A-02).

---

## 8. Component map

```
applications/   knowledge-studio  research-portal  archive-explorer
                administration    public-api       learning-platform        (thin views)
                        │ reads through
domains/        media  language  publishing  preservation  ai-collaboration
connectors/     connector-framework                                          (orchestration / external)
                        │ invokes
capabilities/   reference-capabilities (transcription, translation,
                                        knowledge-extraction, rendering)      (ALL business logic)
                        │ runs on
platform/       knowledge  assets  events  workflow  capability-registry
                identity   governance  configuration  capability-runtime  search   (engines + core)
engines/        observability   platform-catalog
                        │ all import canonical types from
packages/       canonical-kernel  (objects, envelope, 97-type catalog,
                                   append-only log, in-process bus, replay,
                                   security primitives, validator)            (single source of truth)

                ┌───────────────────────────────────────────────┐
                │  ONE shared EventBus + append-only EventLog     │
                │  every service/domain/app publishes & subscribes│
                └───────────────────────────────────────────────┘
```

---

## 9. Request / lifecycle walkthrough (matches `examples/knowledge-lifecycle-demo.mts`)

`npm run demo` composes the real services, domains, and applications on **one
shared event bus** (`new EventBus({ catalog: createPlatformCatalog() })`) and
runs a full institutional journey. The steps below correspond exactly to the
demo and its printed report:

1. **Organization & actor (Identity).** Create an organization and a human
   editor identity → `IdentityCreated` facts (KMOS-0206).
2. **Media import + transcription (Media → Asset Registry + Workflow + Runtime).**
   `media.preserveLecture(...)` registers the audio asset, runs a transcription
   capability through the runtime, and registers a transcript asset; the workflow
   reaches `Completed` (KMOS-0202/0204/0210).
3. **Language → Knowledge.** `language.processTranscript(...)` corrects,
   translates, and extracts concepts; concepts are created as Knowledge Objects
   with multilingual vocabulary (KMOS-0201/0130).
4. **Publication with governance approval (Publishing + Governance).**
   `publishing.publish(...)` requests approval and releases the publication only
   after governance grants it (KMOS-0207/0207).
5. **Preservation.** `preservation.preserve(...)` verifies integrity and builds
   evidence packages for the assets (KMOS-0202).
6. **Search & discovery (Knowledge Studio over Search).** A keyword query returns
   the indexed concept (KMOS-0208 draft).
7. **Lineage / chain of custody (Archive Explorer).** The transcript's ancestors
   trace back to the source audio (KMOS-0140/0202).
8. **Trust assessment (Governance, explainable).** `governance.assessTrust(...)`
   returns a score **with human-readable reasons** for every evidence factor
   (KMOS-0207).
9. **Institutional audit + replay (Event Service).** The whole journey produced
   **88 canonical events with 0 dead letters**, and an "events by producer"
   projection is **rebuilt purely by replaying the log** — demonstrating
   institutional memory reconstruction (KMOS-0203 §14).

This single run exercises all ten constitutional Success Criteria (KMOS-9999 §26)
end-to-end on the live platform at library grade.

---

## 10. Current realization vs. production target (honest status)

The architecture is a faithful structural realization of the specs; what differs
between **today** and the **production target** is realization, not shape.

| Concern                | Current realization (in this repo)                                              | Production target (gated to CI / cloud)                                  |
|------------------------|--------------------------------------------------------------------------------|-------------------------------------------------------------------------|
| Composition            | In-process services on one shared bus; programmatic facades; runnable demo     | Same architecture, extractable to independently deployable services      |
| Persistence            | **In-memory** adapters behind ports; Postgres `EventLog` adapter + DDL exist and are contract-tested against a fake `SqlClient` | Live PostgreSQL (event log + outbox + relational + JSONB + pgvector + graph) verified in CI |
| Kernel event-log port  | **Synchronous** `EventLog` (CRIT-1); Postgres adapter satisfies a separate async interface | One **async** `EventLog` port, both adapters implement it (**KEP-001**, gated to CI under `tsc`) |
| Identity / attribution | Mechanism present (`CallContext`/`Authorizer`/enforcing bus); not pervasively threaded (CRIT-2) | Every write authenticated, authorized, attributed (co-executed with KEP-001) |
| Security               | STRIDE threat model (`documentation/SECURITY-REVIEW.md`)                        | Real OIDC/JWT IdP, mTLS/SPIFFE, Vault secrets, encryption-at-rest, signed events / WORM |
| Server & UI            | **None** — library-grade; the demo is the entry point                          | HTTP/runtime server + reference UI (new code, requires a networked env)   |
| Toolchain gate         | Offline: `npm run fitness` + `node:test` (no npm registry in sandbox; D-E)      | Full `npm run verify` (eslint + `tsc` + fitness + tests) in CI           |

**Why these are gated, not missing.** The offline sandbox has no TypeScript
compiler, no npm registry, no database, no network, and no browser. KEP-001 is a
type-level refactor (~150–200 `await` edits across ~30 files) that **must** be
landed under `tsc` in CI to avoid risking the certified baseline; persistence,
security, server, and UI require running external services. The execution plan is
ready (KEP-001) and the deferral is recorded as an explicit owner decision in
`engineering/IMPLEMENTATION_STATUS.md`.

---

## 11. Specification cross-reference

| Spec(s)                 | Realized by                                                                |
|-------------------------|---------------------------------------------------------------------------|
| KMOS-0001..0010         | Constitutional principles (knowledge-first, AI-as-capability KMOS-0008, multi-tenancy KMOS-0009) honored across the platform |
| KMOS-0100               | `canonical-object.ts`, `identifiers.ts`, `lifecycle.ts`                    |
| KMOS-0110               | `event-envelope.ts`, `schema/event-catalog.ts`, envelope validation       |
| KMOS-0120               | `errors.ts`; capability contracts                                         |
| KMOS-0130               | `platform/knowledge` (Knowledge Object schema)                            |
| KMOS-0140               | `platform/assets` (asset metadata & lineage)                              |
| KMOS-0150               | `platform/workflow` (workflow definition language)                       |
| KMOS-0160 / 0210        | `platform/capability-runtime` (CDK & runtime)                            |
| KMOS-0170               | `connectors/connector-framework` (extension/contribution pattern; marketplace deferred) |
| KMOS-0180               | `applications/public-api`; connectors (API & integration standard)        |
| KMOS-0190               | `security.ts` + `documentation/SECURITY-REVIEW.md` (partial; production items deferred) |
| KMOS-0200               | The platform-service set (nine services) + §17 modular-monolith extraction |
| KMOS-0201..0207         | The seven engines (see §5)                                                |
| KMOS-0208 / 0209 / 0210 | Search / Configuration / Capability Runtime (agent-authored drafts)       |
| KMOS-9999, 10005        | Constitution & engineering charter (supreme authority)                    |
| KMOS-10020              | Repository layout (decision D-003)                                        |
| KMOS-10030              | Canonical object/ownership catalog                                        |
| KMOS-10040              | Canonical event catalog (the 97 types)                                    |
| KMOS-10050              | Atlas / reference applications                                            |

---

## 12. Further reading

- `engineering/IMPLEMENTATION_STATUS.md` — living status + the v1.0-RC gap ledger.
- `engineering/KMOS-CERTIFICATION-REPORT.md` — the M0–M6 certification.
- `engineering/review/01-ARCHITECTURE-REVIEW-REPORT.md` — independent structural review.
- `engineering/review/07-KERNEL-EVOLUTION-PLAN.md` — KEP-001 (async event-log migration).
- `engineering/DECISIONS.md` — ADRs (D-A..D-F, KEP-001).
- `documentation/DEVELOPER-GUIDE.md` — getting started and day-to-day workflow.
- `documentation/OPERATIONS-GUIDE.md`, `documentation/SECURITY-REVIEW.md`.
