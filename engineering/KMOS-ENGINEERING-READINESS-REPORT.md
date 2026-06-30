# KMOS Engineering Readiness Report

**Document:** Engineering Readiness Report (Phases 0–4)
**Prepared by:** Principal Engineer (autonomous implementation agent)
**Date:** 2026-06-30
**Status:** AWAITING APPROVAL — no production code has been written
**Scope:** Completion of Phase 0 (Self Preparation), Phase 1 (Research), Phase 2 (Engineering Organization), Phase 3 (Repository Preparation), Phase 4 (Master Engineering Plan)

---

## 0. How to read this report

This is the gate document for the KMOS implementation mission. It demonstrates that I have read and internalized the constitutional authority, built a complete mental model, researched proven implementation techniques, organized the work, and produced a master plan — *without* writing production code, as instructed.

It ends with a small number of **irreversible decisions that are yours to make** (Section 11) and a request for approval to begin Milestone M0.

A reading order, if you want the short version: Section 1 (executive summary) → Section 11 (decisions you need to make) → Section 12 (readiness verdict). Everything between is the evidence.

---

## 1. Executive Summary

KMOS (Knowledge & Media Operating System) is **an operating system for institutional knowledge** — not a CMS, DAM, workflow engine, search engine, media platform, AI platform, or knowledge graph. It is the coordination layer that makes all of those things behave as governed, replaceable capabilities while *knowledge itself* remains the permanent asset.

The architecture is fully specified across 37 documents and is **internally coherent and implementable**. It rests on **seven Foundational Institutional Engines**:

| Engine | Service | Preserves | Spec |
|---|---|---|---|
| Meaning | Knowledge Service | Institutional meaning | KMOS-0201 |
| Evidence | Asset Registry Service | Institutional evidence | KMOS-0202 |
| Communication | Event Service | Institutional history | KMOS-0203 |
| Coordination | Workflow Service | Institutional execution | KMOS-0204 |
| Execution Knowledge | Capability Registry Service | Institutional abilities | KMOS-0205 |
| Accountability | Identity Service | Institutional responsibility | KMOS-0206 |
| Trust | Governance Service | Institutional trust | KMOS-0207 |

Plus two supporting platform services to complete the canonical core: **Configuration Service** and **Search Service** (KMOS-0200 §18; KMOS-0208 referenced but not yet written).

**Readiness verdict:** I am **ready to begin Milestone M0 (Engineering Foundation)** pending your decisions in Section 11. The specifications are sufficient to implement the entire foundational core (M0–M2) without further clarification. Gaps exist only in *downstream* areas (domain services, federation, marketplace) that the constitution itself defers, plus a small set of genuine ambiguities documented in Section 5 — none of which block the critical path.

The single most consequential thing you must decide is the **reference technology stack** (language, persistence, deployment shape). The constitution is deliberately technology-independent and requires every technology to remain replaceable behind adapters, but *someone* must choose the first concrete implementation. My recommendation is in Section 11/12; it is engineered specifically to honor the "everything replaceable" mandate.

---

## 2. Phase 0 — Mental Model

### 2.1 What KMOS is, in one paragraph

Every meaningful business change publishes an **immutable canonical event** (a fact, never a command). **Capabilities** are the only place business logic lives; they consume and publish events through stable contracts and are catalogued in a **Capability Registry**. The **Workflow Service** coordinates capabilities (it *coordinates, never computes*). **Knowledge Objects** are the authoritative semantic record; **Assets** are the authoritative evidentiary record; graphs, search indexes, and databases are *projections* of these, never the system of record. **Identity** gives every actor (human, service, AI worker, connector) a canonical identity; **Governance** makes every decision explainable through preserved evidence. **Applications** are thin experiences that compose capabilities and never own business logic. Technology is replaceable; institutional knowledge endures.

### 2.2 Constitutional invariants (the non-negotiables)

From KMOS-9999 §3, KMOS-10005, and reinforced throughout. These become **automated architecture-fitness checks** (Section 10.10), not just prose:

1. **Knowledge before Applications** — applications are replaceable views; knowledge is permanent.
2. **Evidence before Files** — files are evidence (Assets), not knowledge.
3. **Capabilities before Services** — business logic lives *only* in capabilities; never in applications, workflows, or events.
4. **Events before Integration** — internal communication is canonical events; events are facts (past tense), immutable, replayable, versioned.
5. **Workflows before Automation** — workflows coordinate; they never compute or embed business rules.
6. **Governance before Publication** — nothing is published without explainable, evidence-based trust.
7. **Identity before Permissions** — every actor has a canonical identity before any authorization.
8. **Trust before Performance** — raw speed never compromises governance, lineage, or reproducibility.
9. **Business Meaning before Technology** — canonical objects/events are authoritative; storage/serialization are projections.
10. **Institutional Memory before Infrastructure** — the platform must reconstruct its state by replaying events.

Plus three engineering invariants that gate every work package: **single authoritative owner per canonical object**; **no shared databases / no cross-service direct DB access**; **no hidden dependencies** (everything explicit).

### 2.3 Canonical object ownership map (from KMOS-10030)

The authoritative owner of each canonical object — *only the owner may mutate it; everyone else references identifiers*:

- **Knowledge Service:** KnowledgeObject, Concept, Vocabulary, Relationship, Collection (+ Definition, Teaching, Question, Answer, Reference, Topic, Ontology)
- **Asset Registry:** Asset, AssetVersion, Provenance, Lineage, EvidencePackage (+ StorageReference, IntegrityRecord, RetentionRecord, ReplicationRecord)
- **Event Service:** CanonicalEvent, EventSchema, Subscription, ReplaySession (+ DeadLetterRecord, Correlation/Causation records)
- **Workflow Service:** WorkflowDefinition, WorkflowExecution, HumanTask, ApprovalTask (+ WorkflowState, Schedule, Timer, ExecutionContext, CompensationPlan)
- **Capability Registry:** Capability, CapabilityManifest, CapabilityContract, CapabilityCertification (+ Classification, Dependency, Profile, Documentation, LifecycleRecord)
- **Identity Service:** Identity, Organization, Role, Permission, Delegation (+ Group, Credential, TrustRelationship, ServiceAccount, AutomationAccount, Session)
- **Governance Service:** Policy, Approval, Certification, ComplianceRecord, TrustAssessment (+ PolicyVersion, Review, Decision, RiskAssessment, Exception, GovernanceAudit)

Every persistent object carries the **common structure** (KMOS-0100 §5, KMOS-10030 §14): canonical identifier, schema version, lifecycle state, owner, version, created/updated timestamps, explicit relationships (by identifier), and governance metadata.

### 2.4 Canonical event model (from KMOS-0110, KMOS-10040)

- **Naming:** `BusinessObject + PastTenseVerb`, singular, business vocabulary (`AssetRegistered`, not `RegisterAsset`).
- **Envelope (three sections):** Identity (event id, type, schema version, timestamp, producer domain/capability, **correlation id**, **causation id**, tenant/org id) · Business Payload (canonical identifiers only, no infrastructure metadata) · Governance Metadata (workflow id, capability id, related assets/knowledge, approval status, security classification, evidence/lineage refs, execution id).
- **Four classes (KMOS-10040 §4):** Institutional (permanent facts) · Platform (service lifecycle) · Capability (business work performed) · Operational (*must not become institutional history*).
- **Guarantees:** immutable, append-only, validated-before-publish, at-least-once delivery, idempotent consumers, ordering only within an aggregate/stream, replay is first-class, dead-letters never silently dropped.

### 2.5 Document hierarchy & authority

The constitution defines its own precedence (KMOS-9999 §28). You directed me to treat the constitution and specifications as **one corpus and reconcile conflicts**. Reconciliation rules I will apply (Section 6):

1. KMOS Constitution Series (0001–0010)
2. Engineering Foundation (0100–0190)
3. Platform Service Specs (0200+)
4. Implementation Constitution (9999) + Engineering Charter (10005) + Repository Constitution (10020)
5. Reference catalogs (10030 objects, 10040 events, 10050 atlas) — *operationalize* the above
6. Reference implementations → source code

Tie-breakers: **higher architectural spec > implementation guidance; business meaning > technology; institutional preservation > convenience.**

---

## 3. Phase 0 — Architectural Dependencies

### 3.1 Build/dependency order (KMOS-9999 §4, KMOS-10000, KMOS-10010, KMOS-10050 §16)

The specs agree on a strict dependency order. The critical path:

```
        ┌─────────── Layer A: Institutional Records (no business deps) ───────────┐
        │  Knowledge   Asset Registry   Event Service   Identity   Governance     │
        └────────────────────────────────────┬───────────────────────────────────┘
                                              ▼
                                   Capability Registry
                                              ▼
                                   Capability Runtime
                                              ▼
                                     Workflow Service
                                              ▼
                          Configuration  +  Search  (+ Notifications, Scheduling)
                                              ▼
                                      Domain Services
                                              ▼
                                       Applications
```

### 3.2 The bootstrap subtlety (a real dependency cycle to resolve early)

The five Layer-A engines are described as foundational, but they have **latent mutual dependencies** that must be sequenced deliberately:

- **Everything depends on the Event Service** to publish/consume canonical events — yet the Event Service is itself a service that should publish events.
- **Everything depends on Identity** for authenticated/authorized actions — yet Identity must exist before it can authorize the bootstrapping of other services.
- **Governance consumes events from every service** (KMOS-0207) and Identity, Knowledge, Asset all *publish* events — so the Event Service contract must exist before any of them can emit.

**Resolution (documented as decision D-002):** implement in this micro-order inside M1, using in-process event dispatch first so no service hard-depends on a running broker:

1. **Canonical kernel** (shared library, not a service): event envelope, canonical object base, identifiers, schema-validation interfaces, error taxonomy. (This is M0 work.)
2. **Event Service** core (schema registry + append-only log + in-process dispatcher + replay). It may emit its *own* operational events to its own log — no cycle.
3. **Identity Service** (so subsequent actions are attributable). Bootstrapped with a seeded "platform-root" identity and service accounts for each engine.
4. **Asset Registry** and **Knowledge Service** (both now able to authenticate and emit events).
5. **Governance Service** (now able to consume the events the others emit).

This ordering is consistent with KMOS-10000's "Knowledge, Assets, Events, Identity, Governance" set while making the *internal* sequencing explicit.

### 3.3 Cross-service contract dependencies

- Knowledge ← references Asset identifiers (evidence) and consumes `TranscriptCorrected`, `AssetRegistered`, etc.
- Governance ← consumes business events from all; produces `ApprovalGranted`/`CertificationGranted` consumed by Knowledge/Workflow/Capability Registry.
- Workflow ← discovers executable capabilities via Capability Registry; coordinates Governance approvals; progresses on canonical events from Event Service.
- Identity ← authorizes operations and event subscriptions across all services.

These are **contract** dependencies (events + business APIs), never database dependencies — the dependency graph stays acyclic at the data-ownership level.

---

## 4. Phase 0 — Implementation Risk Register

Severity × Likelihood; mitigations are built into the plan. Full living version in `KNOWN_ISSUES.md`.

| ID | Risk | Sev | Mitigation |
|---|---|---|---|
| R-01 | **Business logic leaks into Workflow/Applications/Events**, violating the central invariant | High | Architecture-fitness tests (dependency-direction + "no domain imports in app/workflow" lint); code review checklist; capability boundary enforced by ports |
| R-02 | **Canonical object/event drift** — services inventing private models or event names | High | Single source-of-truth schema package generated from catalogs (10030/10040); CI rejects unregistered events; contract tests |
| R-03 | **Event schema breaking changes** break consumers | High | Schema registry with compatibility modes (BACKWARD default); breaking change ⇒ new versioned type; replay-impact analysis in DoD |
| R-04 | **Replay not actually deterministic** (hidden clocks/IO/order assumptions) | High | Deterministic core / IO-in-adapters discipline; replay tests per service from M1; replay metadata stored separately from history |
| R-05 | **Bootstrap cycle** (Section 3.2) mishandled, causing tangled startup | Med | Explicit micro-order; in-process dispatcher first; seeded platform-root identity |
| R-06 | **Scope explosion** — building deferred features (federation, marketplace, semantic reasoning) too early | Med | Roadmap hard-gates these to "Planned"; DoD requires reference-app validation before advancing |
| R-07 | **Storage coupling** — Postgres/graph specifics leaking past repository ports | Med | Ports-and-adapters mandatory; "no SQL outside infrastructure/" lint; adapter contract tests |
| R-08 | **Governance/lineage treated as afterthought**, hard to retrofit | High | Every work package's DoD includes events + lineage + audit; Governance built in M1, not later |
| R-09 | **Single long-running agent loses context** across multi-day build | Med | Living tracking docs (status/next/decisions/issues) as persistent memory; one work package at a time; commit working increments |
| R-10 | **Idempotency/at-least-once not honored** ⇒ duplicate side effects | Med | Inbox/dedup table keyed on event id; idempotent upserts in all projections |
| R-11 | **Multi-language sprawl** if capability workers proliferate languages | Low | Capability contract (proto/JSON-Schema) is the boundary; reference workers in one language; others must pass contract certification |
| R-12 | **Spec gaps** (Section 5) resolved with undocumented assumptions | Med | Every deviation/assumption logged in `DECISIONS.md`; pause only for genuine architectural ambiguity |

---

## 5. Phase 0 — Missing / Incomplete Specifications

These are genuine gaps. **None block the M0–M2 critical path.** Each has a proposed handling, logged in `DECISIONS.md`.

1. **KMOS-0208 Search & Discovery Service** — referenced (KMOS-0207 "Next Specification", KMOS-0200 §5) but not present. *Handling:* Search is M2.5/Layer-3 and downstream of the core; implement to the patterns in KMOS-0200/0180 and the canonical catalogs; draft a 0208-conformant service spec as a deliverable for your review before building. **Not on critical path.**
2. **Configuration Service** — named as canonical core (KMOS-0200 §5/§18, roadmap M2.4) but has **no dedicated specification**. *Handling:* derive its contract from KMOS-0160 §9 (externalized configuration), KMOS-0190 (secrets), and KMOS-0200; draft a short service spec for approval in M2.
3. **Capability Runtime** — required (roadmap M2.2) but specified only implicitly (KMOS-0160 runtime contract; KMOS-0205 explicitly *excludes* execution). *Handling:* define the runtime as the execution counterpart to the Registry, using KMOS-0160 as the normative contract; spec drafted in M2.
4. **Concrete schemas** — the catalogs enumerate objects/events and required fields but do not give field-level JSON Schemas. *Handling:* I will author canonical JSON Schemas in M0 (the "canonical kernel"), derived strictly from KMOS-0100/0110/0130/0140 + 10030/10040, and treat them as the single source of truth. This is *operationalization*, not redesign.
5. **Reality-Check tables** (KMOS-0200 §19 et al.) reference prior systems ("Media Pipeline", "AIMPOS") as proven evidence. Those repositories are **not in this workspace**. *Handling:* treat them as unavailable evidence; implement from specs. If you can add them as references (they'd be valuable per the "Existing Projects" guidance), I will extract proven patterns — but will not copy architecture.
6. **Tenancy model** — multi-tenancy is asserted (org identifier in every envelope; KMOS-0009) but isolation strategy (shared-schema vs schema-per-tenant vs db-per-tenant) is unspecified. *Handling:* default to **shared-schema with mandatory org-id scoping** behind repository ports (cheapest, replaceable); flag for your confirmation (deferrable to M1).
7. **Future family specs** (KMOS-11xx events, 12xx capabilities, 13xx knowledge, 14xx assets, 15xx workflows, 16xx CDK, 17xx extensions, 18xx APIs, 19xx security) are enumerated as future work. *Handling:* out of scope until the core proves the architecture; explicitly deferred.

---

## 6. Phase 0 — Constitutional Reconciliation

Per your direction, I treated the constitution and specifications as one corpus. I found **no hard contradictions** — the corpus is unusually consistent. The only items needing reconciliation are precedence/format clarifications:

- **Self-declared precedence vs. "equal" treatment.** KMOS-9999 §28 ranks architecture specs above implementation guidance; you asked me to reconcile both as equals. *Reconciliation:* I treat them as one corpus for *intent*, and use §28's ranking only as a **tie-breaker** when two documents give incompatible concrete guidance. No active conflict exists today.
- **"Nine canonical core services" vs "seven engines."** KMOS-0200 §5/§18 lists nine services (the seven engines + Configuration + Search/Event/Capability Registry variants); the dossier emphasizes seven *engines*. *Reconciliation:* seven engines are the permanent foundation; Configuration and Search are required platform services that complete the core. No conflict — different granularities.
- **Repository layout variants.** KMOS-9999 §5 and KMOS-10020 give slightly different top-level trees (e.g., `platform/` vs `platform/ + engines/`). *Reconciliation:* both say layout MAY evolve while preserving boundaries; I adopt the richer KMOS-10020 tree (Section 9) as it is the dedicated Repository Constitution.

All reconciliation decisions are recorded in `DECISIONS.md` (D-003…D-006).

---

## 7. Phase 1 — Research Findings (implementation techniques only)

Per the mission, I studied production systems and specs to extract **techniques**, never architecture. KMOS's architecture remains authoritative. Each technique below is mapped to a KMOS subsystem and to a Postgres-first / ports-and-adapters realization. Full source links are in `DECISIONS.md` appendix.

### 7.1 Event Service (← EventStoreDB, Kafka, NATS JetStream, Confluent SR, CloudEvents, Outbox/Debezium)
- **Append-only log with per-stream version + optimistic concurrency** → Postgres `events(stream_id, version)` with `UNIQUE(stream_id, version)`; insert-conflict = optimistic lock. Ordering guaranteed per aggregate by `version`.
- **Transactional Outbox** → write business row + event row in one ACID tx; a relay/CDC publisher forwards to any broker later. Solves dual-write; keeps broker swappable.
- **Idempotent consumer** → `processed_events` dedup table keyed on `event_id`; combine with outbox for effectively-once.
- **Schema registry + compatibility modes** → Postgres `schema_registry(subject, version, schema, compatibility)`; default BACKWARD; breaking change ⇒ new versioned subject (e.g., `KnowledgeUpdated.v2`).
- **CloudEvents envelope** → canonical mapping for our event identity section (id, source, type, specversion, subject, time, traceparent, extensions for correlation/causation).
- **Correlation/causation triplet** (Greg Young) → copy parent's correlation id; set parent's message id as your causation id; three columns on every event row.
- **Replay via shadow projection + checkpoints** → read immutable log by global sequence; build new projection; atomic switch; replay metadata in separate `replay_runs` table — history never mutated.
- **DLQ + exponential backoff w/ jitter, failure classification** → `dead_letters` table + retry scheduler; poison pills go straight to DLQ; DLQ is for human judgment, never auto-loop.

### 7.2 Workflow Service (← Temporal/Cadence, Conductor, Airflow, Step Functions, Saga)
- **Event-history durable execution** → persist *coordination events*, reconstruct execution state by replay; no computed-state snapshots as system of record.
- **Deterministic replay; workflow-vs-activity split** → deterministic coordinator core; all IO/clocks/randomness in adapters ("activities"). Directly mirrors "coordinate, never compute."
- **Versioning (patching / worker-build-id)** → safely evolve long-running (weeks-long) workflows without breaking in-flight replays.
- **Declarative DSL with explicit data routing** (ASL-style over Conductor global context) → our Workflow Definition Language (KMOS-0150) realized as declarative JSON/YAML with explicit input/result paths; more deterministic.
- **Acyclic graph + idempotent steps** (Airflow) → cycle-free definitions; safe retries/replay.
- **Orchestrated Saga** → central coordinator invokes compensating steps in reverse on failure; compensation modeled as first-class reverse capabilities (matches KMOS-0204 §18).

### 7.3 Policy / Governance (← OPA, Cedar, PDP/PEP/PAP)
- **PDP/PEP/PAP separation** → PEP is a thin port in each service; PDP is the Governance/Policy evaluator; authorization stays out of business logic.
- **Versioned, signed policy bundles + decision logs** → policies are immutable versioned artifacts; every decision logged with policy version + input + result for tamper-evident audit (satisfies KMOS-0207/0190 audit).
- **Cedar-style schema validation** → if policy is purely authz, a schema-validated, statically-analyzable policy set is preferred for determinism; start with a simple deterministic evaluator behind the port, allow OPA/Cedar adapter later.

### 7.4 Capability Registry & Runtime (← gRPC/protobuf, buf, WASM component model, OCI/ORAS, Backstage, sidecar)
- **Stable contracts via protobuf/JSON-Schema; `reserved` fields; `buf breaking` CI** → capability contracts never break silently; additive-only evolution + automated compatibility gating.
- **Machine-readable manifest + semver + WIT-style interface decls** → realizes KMOS-0120/0160 manifest; host/capability agree on contract version or binding fails.
- **Catalog with dependency graph + DAG cycle detection** (Backstage relations + Airflow acyclicity) → Capability Registry dependency graph with circular-dependency rejection (KMOS-0205 requirement).
- **OCI artifacts (ORAS) for packaging; `subject` links signatures/SBOMs** → package capability bundle + manifest + certification attestation together.
- **WASM/WASI least-privilege sandbox; sidecar for cross-cutting concerns** → isolated, independently-scalable capability execution with no ambient authority (KMOS-0160 isolation).

### 7.5 Knowledge Service (← Neo4j/openCypher, RDF-star, SQL:2011 bitemporal, XTDB/Datomic, Apache AGE, CQRS projections, entity resolution)
- **First-class versioned relationships** (property graph edges with provenance / RDF-star quoted triples) → Relationship is itself a Knowledge Object (KMOS-0130 §8).
- **Bitemporal, append-only "as-at" history** (SQL:2011 / Datomic datoms) → immutable Knowledge versions; "what did we know, and when."
- **Graph as projection** (Apache AGE + recursive CTEs + ltree over Postgres; CQRS rebuild-by-replay) → authoritative Knowledge Objects in the relational/event store; graph is a rebuildable projection (KMOS-0201 §12 — "graph SHALL NEVER become the system of record").
- **Entity resolution (blocking + clustering)** → prevent duplicate concepts (KMOS-0201 §13 semantic integrity); merge emits a canonical golden record.

### 7.6 Search (← OpenSearch, pgvector/HNSW, FAISS, RRF, CDC, chunking)
- **Index aliases + atomic reindex swap; idempotent upsert-by-id** → search is a projection; rebuildable, zero-downtime swaps.
- **Hybrid search (BM25 + vector via Reciprocal Rank Fusion, k=60)** → engine-agnostic fusion at the application layer.
- **pgvector HNSW first** (one adapter covers keyword + vector), OpenSearch adapter later.
- **Event-driven index via outbox/CDC** → no dual-write; index consumes canonical events.

### 7.7 Identity (← Keycloak, OIDC/OAuth2, SPIFFE/SPIRE, Zanzibar/SpiceDB/OpenFGA, RFC 7662/8693)
- **Service accounts + client-credentials** → first-class non-human identities (services, AI workers, connectors) as subtypes of canonical Identity (KMOS-0206: "AI SHALL never operate anonymously").
- **OIDC authn behind business APIs; token introspection** → IdP swappable behind an authn port.
- **SPIFFE/SVID workload identity** → verifiable service/workload identity for mTLS.
- **Zanzibar-style ReBAC tuples `(object, relation, subject)` + snapshot tokens** → orgs/roles/delegation as relations in a swappable authz store behind the PDP; delegation via RFC 8693 on-behalf-of (`act` claim).

### 7.8 Asset Registry — provenance/lineage/integrity (← W3C PROV-O, content addressing/Merkle, in-toto/Sigstore, OpenLineage, S3 Object Lock, Apache OpenDAL, DVC)
- **W3C PROV-O model** (Entity/Activity/Agent + `wasGeneratedBy`/`wasDerivedFrom`/`wasAttributedTo`) → canonical provenance graph; storage objects are referenced Entities (KMOS-0140/0202).
- **Content-addressed storage + Merkle hashing** → tamper-evident integrity; any backend serving the bytes is interchangeable.
- **OpenLineage-style lineage events** → lineage emitted as events, reconstructable independent of storage.
- **Storage abstraction (S3 API / Apache OpenDAL)** → the literal storage-replaceable adapter; WORM/Object-Lock for retention/legal-hold.
- **DVC-style content-pinned reproducibility** → pin input hashes + capability/workflow versions ⇒ reproduce any published asset (KMOS-0140 reproducibility).

---

## 8. Phase 2 — Engineering Organization

A single autonomous principal engineer (me) executes the mission, **delegating bounded, independent work to specialized sub-agents** and coordinating through the living tracking docs. The mission's suggested teams map to sub-agent *roles* invoked per work package:

| Team / Role | Responsibility | Invoked as |
|---|---|---|
| Architecture Coordination | Owns invariants, dependency order, reconciliation, ADRs | Me (principal) — never delegated |
| Platform Services | Implements the 7 engines + Config/Search | Implementation sub-agents, one service at a time |
| Capability Runtime | Capability execution, isolation, manifests | Implementation sub-agent (M2) |
| Workflow Engine | Coordinator, scheduler, human/approval tasks, saga | Implementation sub-agent (M2) |
| Knowledge / Asset / Identity / Governance / Search | Per-engine implementation | Implementation sub-agents (M1) |
| Research | Technique extraction (as in Phase 1) | Research sub-agents, on demand |
| Testing / QA | Test suites, replay/contract/governance tests | Verification sub-agents (DoD gate) |
| Security | Threat review, secrets, authz, audit | Verification sub-agent per service + M5 review |
| DevOps | CI/CD, containers, deploy manifests, observability | Implementation sub-agent (M0 + per service) |
| Documentation | Arch/API/event/data/ops docs | Bundled into each work package's DoD |
| Repository Management | Structure, standards, fitness checks, tracking docs | Me (principal) |

**Coordination rules (multi-agent strategy, Section 10.8):**
- One work package "in_progress" at a time on the critical path; independent packages may parallelize via concurrent sub-agents.
- Every sub-agent receives: the relevant spec excerpts, the canonical kernel contracts, the DoD, and the architecture-fitness rules. It returns implementation + tests + docs.
- The principal integrates, runs fitness/verification gates, updates tracking docs, and only then marks the package done.
- **Verification is independent of implementation** — a separate sub-agent verifies each package (constitution §16 testing; mission verification step).

---

## 9. Phase 3 — Repository Preparation

### 9.1 Repository structure (adopted from KMOS-10020, reconciled with KMOS-9999 §5)

```
kmos/
├── specifications/        # normative docs (read-only; governance-gated changes)
├── constitution/          # 9999, 10005, 10020, coding & governance constitutions
├── architecture/          # diagrams, data models, object/event catalogs, atlas, ADRs
├── platform/              # the foundational engines + config/search (one dir each)
│   ├── knowledge/  assets/  events/  identity/  governance/
│   ├── capability-registry/  configuration/  search/
├── engines/               # reusable execution infra (workflow runtime, capability runtime, policy eval, scheduler, notifier)
├── capabilities/          # reusable business logic (speech, translation, knowledge-extraction, rendering, publishing…)
├── domains/               # compose capabilities (media, language, publishing, preservation, learning, research, ai)
├── applications/          # thin experiences (studio, research portal, archive explorer, admin, mobile)
├── extensions/            # governed plugins (KMOS-0170)
├── connectors/            # external integrations (translate to canonical objects/events)
├── sdk/                   # client libs, capability/extension templates, test utils
├── packages/              # shared: canonical-kernel (objects, events, schemas, errors, ids)
├── tools/                 # dev tooling, code generators, fitness checks
├── deployment/            # docker, compose, k8s/helm, CI/CD, monitoring
├── governance/            # executable policies, certification configs
├── testing/               # cross-cutting: integration, replay, contract, performance, governance
├── examples/              # runnable reference flows (e.g., lecture pipeline)
├── documentation/         # arch, dev guides, ops, deployment, tutorials, migration
├── scripts/               # bootstrap, migrate, seed
└── engineering/           # this report + living tracking docs (status/next/decisions/issues)
```

**Dependency direction (enforced by fitness check):** `applications → domains → capabilities → platform → infrastructure`. Reverse deps require a logged ADR. No service imports another service's internals; cross-service contact is events + business APIs only.

### 9.2 Development standards (to be written as `constitution/CODING-CONSTITUTION.md` in M0)
- Separate domain / application / infrastructure / API layers in every service (matches the reference layouts in KMOS-0201…0207).
- Ports-and-adapters: domain core has zero infrastructure imports; storage/broker/IdP/model behind ports.
- Canonical objects/events imported from `packages/canonical-kernel` only — never redefined.
- Explicit interfaces; no shared mutable state; no circular deps; composition over inheritance (constitution §21).
- Every public behavior covered by tests; every business change publishes a canonical event.

### 9.3 Living tracking documents (seeded now, in `engineering/`)
- **IMPLEMENTATION_STATUS.md** — milestone/work-package status, evidence-based.
- **NEXT_TASK.md** — the single next work package, fully specified.
- **DECISIONS.md** — ADRs, reconciliations, assumptions, research sources.
- **KNOWN_ISSUES.md** — risks, gaps, technical debt, deferrals.

These four are the **persistent engineering memory** that makes a multi-day autonomous build resilient to context loss (mitigates R-09).

---

## 10. Phase 4 — Master Engineering Plan

### 10.1 Milestones (from KMOS-10010, made executable)

| Milestone | Goal | Exit criterion |
|---|---|---|
| **M0 Engineering Foundation** | Repo, canonical kernel, standards, CI/CD, test+doc frameworks, local env | Repo initializes; CI green; canonical schemas + envelope published; one end-to-end "hello canonical event" round-trips in-process with a replay test |
| **M1 Foundational Engines** | Event, Identity, Asset Registry, Knowledge, Governance | Each passes its spec's acceptance criteria; cross-engine event flow + replay validated; every action attributable + governed |
| **M2 Capability Execution** | Capability Registry, Capability Runtime, Workflow Service, Configuration, Search | Capabilities discoverable + certifiable; long-running workflow with human/approval task + compensation runs deterministically; external config + cross-service search operational |
| **M3 Domain Services** | Media, Language, Publishing, Preservation, AI Collaboration, Connector framework | Each composes capabilities + reuses engines; no business logic outside capabilities |
| **M4 Applications** | Studio, Research Portal, Archive Explorer, Admin, Mobile | Thin apps compose platform via business APIs only |
| **M5 Production Hardening** | Perf, security review, scalability, DR, monitoring, migration tests | Hardening checklist + security review pass |
| **M6 Reference Certification** | Validate via reference applications | A real flow (e.g., lecture → knowledge → publication → archive) runs end-to-end and is fully reproducible/auditable |

### 10.2 Implementation order (work packages, critical path)

`WP-0` M0 foundation → `WP-1` Event Service → `WP-2` Identity → `WP-3` Asset Registry ∥ `WP-4` Knowledge → `WP-5` Governance → `WP-6` Capability Registry → `WP-7` Capability Runtime → `WP-8` Workflow Service → `WP-9` Configuration ∥ `WP-10` Search → (M3 domain WPs) → (M4 app WPs) → M5 → M6. `∥` = parallelizable via concurrent sub-agents once the kernel exists.

### 10.3 Work-package template (KMOS-10010) — every package defines
Objective · Governing specs · Dependencies · Deliverables (impl + tests + docs + deployment artifacts + migration notes) · Acceptance criteria · Operational evidence · Governance review.

### 10.4 Definition of Done (KMOS-10010, KMOS-9999 §22) — a package is done only when
implementation complete · all tests passing · documentation complete · canonical events validated · business contracts verified · observability operational · governance approved · deployment verified · production readiness demonstrated. **"Done" means production-ready, not compiling.**

### 10.5 Testing strategy (constitution §16; per-service §23/24)
Ten mandated categories per service: unit, integration, contract, event, workflow, migration, performance, replay, governance, acceptance. Cross-cutting suites in `testing/`. **Replay tests and contract tests are first-class gates**, not optional. Verification performed by a sub-agent independent of the implementer.

### 10.6 CI/CD strategy
Pipeline stages: lint + typecheck → **architecture-fitness checks** (dependency direction; no domain imports in app/workflow; no SQL outside infrastructure; only-registered-events) → unit/contract tests → build images → integration + replay tests (ephemeral Postgres) → schema-compatibility check (buf/JSON-Schema, BACKWARD) → SBOM + artifact signing (Sigstore-style) → publish. Trunk-based, small focused commits, working increments (constitution §27, KMOS-10020).

### 10.7 Deployment strategy
**Modular-monolith-first** (single deployable composing all services in-process, Postgres-backed, in-process event dispatch) → progressively extractable to independently deployable services behind the same contracts (KMOS-0200 §17 explicitly supports monolith → modular monolith → containers → k8s without changing logical architecture). Docker + compose for dev; k8s/Helm manifests authored per service for M5. Each service supports independent deploy/scale/recovery/versioning + health/readiness probes (constitution §19).

### 10.8 Multi-agent coordination strategy
See Section 8. Principal owns architecture + integration + tracking; implementation sub-agents own one package each; verification sub-agents own the DoD gate; research sub-agents on demand. Tracking docs are the shared memory. Independent packages parallelize; the critical path is serial.

### 10.9 Documentation strategy (constitution §17, KMOS-10020)
Per service: architecture, API (OpenAPI), event catalog contribution, data model, operational guide, deployment guide, migration guide, testing guide. Docs evolve *with* code inside the same work package (DoD gate). Architecture diagrams + ADRs live in `architecture/`.

### 10.10 Architectural validation strategy
1. **Automated fitness functions** in CI encoding the invariants (Section 2.2).
2. **Canonical conformance**: objects/events validated against the kernel schemas generated from 10030/10040.
3. **Reference-application validation** (M6): "a feature is not complete until demonstrated within a working reference application" (KMOS-10000).
4. **The Atlas (KMOS-10050) stays synchronized** — reviewed whenever a service/engine/object/event family is added.
5. **Governance gate**: every package's events + lineage + audit reviewed for explainability before "done."

---

## 11. Decisions Requiring Your Approval (irreversible / product-level)

The constitution instructs me to pause for irreversible architectural and product decisions. These three are pivotal because they shape every service. My recommendation for each is given; I will ask you to confirm before M0.

**D-A — Reference technology stack (primary platform language).** The constitution mandates technology-independence behind adapters, but the *first* implementation must pick a language. **Recommendation: TypeScript (Node.js, strict) for all platform services, SDK, and thin applications; Python reserved for AI/media capability *workers*** (legitimate because the capability contract — protobuf/JSON-Schema — is the boundary, and AI/model independence is explicitly required). Rationale: one language across services + apps + SDK maximizes velocity and clarity for a single autonomous builder, has first-class typing for canonical contracts, and keeps applications genuinely thin. Alternatives: **Go** (simplest services, weaker for rich domain modeling + AI), **Java/Kotlin + Spring** (most enterprise-proven, heaviest), **Python everywhere** (best AI ecosystem, weaker typing/perf for the core).

**D-B — Persistence approach.** **Recommendation: PostgreSQL-first polyglot-by-projection.** One Postgres instance provides the append-only event log + outbox, relational records, JSONB documents, `pgvector` (embeddings), and graph via Apache AGE/recursive CTEs — all behind repository ports so specialized stores (Neo4j, OpenSearch, object storage, a real broker) can be slotted later without touching domain logic. Rationale: honors "storage replaceable" while minimizing moving parts early (constitution: simplicity, correctness before optimization). Alternative: **specialized stores from day one** (more "correct" per polyglot-persistence, far more operational surface and risk early).

**D-C — Deployment shape first.** **Recommendation: modular monolith first**, extractable to independently deployable services behind identical contracts (explicitly endorsed by KMOS-0200 §17). Rationale: fastest path to a working, replayable, end-to-end core; preserves logical architecture; avoids premature distributed-systems complexity. Alternative: **microservices from day one** (truer to the long-term picture, but slower and riskier to bootstrap, and contradicts "correctness before optimization").

A fourth decision — **multi-tenancy isolation** (Section 5, item 6) — is deferrable to M1; my default is shared-schema with mandatory org-id scoping behind ports. I'll confirm it when M1 starts unless you want to set it now.

---

## 12. Readiness Assessment & Recommendation

**Phases 0–4 are complete.** I have: read the entire corpus and built a complete, reconciled mental model (Phase 0); extracted production techniques mapped to every subsystem without importing foreign architecture (Phase 1); organized the work into a principal + sub-agent model (Phase 2); defined the repository, standards, and living memory (Phase 3); and produced a milestone-by-milestone master plan with dependency graph, testing, CI/CD, deployment, coordination, documentation, risk, and validation strategies (Phase 4).

**The specifications are sufficient to implement the entire foundational core (M0–M2) with no further clarification.** The only spec gaps are downstream and largely self-deferred by the constitution; I have a documented, non-blocking handling for each.

**My recommendation:** approve the three decisions in Section 11 (or amend them), and authorize me to begin **Milestone M0 — Engineering Foundation**, which produces the repository scaffold, the canonical kernel (objects/events/schemas), coding standards, CI/CD with architecture-fitness checks, and an end-to-end "canonical event round-trip + replay" proof — all reviewable before any engine is built.

Per the mission, **I am stopping here and awaiting your approval.** No production code has been written.

---

## Appendix A — Document Index (37 documents read)

**Constitution:** KMOS-9999 (Implementation Constitution), KMOS-10005 (Product Vision & Engineering Charter).
**Foundation:** KMOS-0001 Charter · 0002 Domain Model · 0003 Event Model · 0004 Capability Framework · 0005 Knowledge Graph · 0006 Asset Registry · 0007 Workflow Engine · 0008 AI Collaboration & Governance · 0009 Reference Applications · 0010 Technical Reference Architecture.
**Engineering Foundation:** 0100 Canonical Data Model · 0110 Canonical Event Catalog Spec · 0120 Capability Specification Standard · 0130 Knowledge Object Schema · 0140 Asset Metadata & Lineage · 0150 Workflow Definition Language · 0160 Capability Development Kit & Runtime · 0170 Plugin & Extension Framework · 0180 API & Integration Standard · 0190 Security & Trust Architecture · 0200 Platform Service Architecture.
**Platform Services:** 0201 Knowledge · 0202 Asset Registry · 0203 Event · 0204 Workflow · 0205 Capability Registry · 0206 Identity · 0207 Governance.
**Reference:** 10000 Implementation Dossier · 10010 Master Roadmap · 10020 Repository Constitution · 10030 Canonical Object Catalog · 10040 Canonical Event Catalog · 10050 Reference Architecture Atlas.

## Appendix B — Recommended reading order for new contributors (KMOS-10050 §20)
10005 → 9999 → 10000 → 10010 → 10020 → 10030 → 10040 → 10050 → 0201–0207 → domain specs.
