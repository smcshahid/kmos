# KMOS Security Review & Threat Model

_Reference implementation security review, conformant to **KMOS-0190 Security & Trust Architecture**._
_Scope: M5 (Production Hardening) entry review. Status: the platform is a modular-monolith reference implementation with in-memory adapters behind ports; production infrastructure (real IdP, Vault, mTLS, encryption-at-rest) is deferred to deployment._
_Last updated: 2026-06-30 · Audience: principal engineers, security reviewers, operators._

---

## 1. Purpose & honesty statement

This document is a security review and STRIDE-style threat model of the KMOS reference
implementation. It is written to **KMOS-0190**, whose central claim is that *"Trust SHALL
emerge from architecture rather than assumption"* (KMOS-0190 §3). The goal here is the
opposite of marketing: every control is labelled **implemented**, **partial**, or
**deferred-to-production** against what is *actually in the repository today*, not against
what the architecture will eventually support.

The reference implementation deliberately realises the **trust architecture** (canonical
identity, immutable audit, evidence-driven governance, event integrity, asset integrity)
in code now, while deliberately deferring **infrastructure security** (cryptographic
transport, secret storage backends, a real identity provider, encryption-at-rest) to the
production deployment, behind ports that already exist. KMOS-0190 §25 explicitly permits
this: *"Partial implementations SHALL declare unsupported requirements."* This review is
that declaration.

The architectural enabler is ports-and-adapters (DECISIONS D-006; constitution §2): storage,
broker, identity provider, secret store and AI models are all accessed through ports, with
in-memory adapters today and production adapters slotted later **without changing the service
core**. Security-relevant ports already present in the code:

| Port | Interface (file) | Today's adapter | Production adapter (deferred) |
|---|---|---|---|
| Authentication | `platform/identity/src/infrastructure/authentication-port.ts` | `InMemoryAuthenticationAdapter` | OIDC / Keycloak introspection |
| Secret resolution | `platform/configuration/src/domain/secret-resolver.ts` | `EchoSecretResolver` (in-memory) | HashiCorp Vault / cloud KMS |
| Asset storage | `platform/assets/src/domain/storage-port.ts` | `InMemoryStorageAdapter` | S3 / OpenDAL with WORM/Object-Lock |
| Checksum / integrity | `platform/assets/src/domain/checksum-port.ts` | `Sha256ChecksumAdapter` (`node:crypto`) | (already production-grade) |
| Event log | `packages/canonical-kernel/.../append-log.ts` | `InMemoryEventLog` | Postgres event log + outbox |

---

## 2. Security principles conformance (KMOS-0190 §4)

| KMOS-0190 §4 principle | How the reference implementation realises it | Status |
|---|---|---|
| Least Privilege | Explicit Permission/Role model; authorization denies by default and requires an explicit grant (`platform/identity/.../authorization.ts`). | Implemented (policy layer) |
| Defense in Depth | Authn at the edge, authz (PDP) per use-case, governance approval gates, immutable audit, event validation. Network-layer defenses (mTLS, WAF) deferred. | Partial |
| Zero Trust | Every actor (human and non-human) is a named canonical identity; no anonymous participation in governed operations. Workload-identity attestation (SPIFFE) deferred. | Partial |
| Explicit Authorization | `AuthorizationDecision` is structured and explainable: every allow/deny carries a machine-readable reason. | Implemented |
| Immutable Audit | Append-only event log; `GovernanceAudit` canonical object; history never updated or deleted. | Implemented (in-memory log) |
| Secure by Default | Identities default to no roles/permissions; approvals default `Pending`; trust defaults `NOT TRUSTED` without evidence. | Implemented |
| Privacy by Design | Classification fields on events (`securityClassification`) and governance metadata; retention modelled in the Asset Registry. Enforcement of deletion/export deferred to policy adapters. | Partial |
| Governance First | All business work is governed capabilities; AI output is non-authoritative until human review (KMOS-0008). | Implemented |
| Technology Independence | Ports-and-adapters; fitness checks forbid infrastructure imports in domain cores. | Implemented |
| Institutional Accountability | Every fact is attributable to a canonical `actorId`; security decisions produce events + evidence (KMOS-0190 §24). | Implemented |

---

## 3. Trust domains (KMOS-0190 §5)

KMOS-0190 §5 names ten trust domains, each with an independent boundary. The reference
implementation maps them onto modules whose boundaries are enforced by the architecture
fitness checks (`tools/fitness-checks/run.mjs`: no cross-service internal imports; contact
is canonical events + business APIs only).

| Trust domain (§5) | Owning module(s) | Boundary enforcement |
|---|---|---|
| Identity | `platform/identity` | Owns all canonical Identity objects; sole issuer of Sessions and authz decisions. |
| Knowledge | `platform/knowledge` | Knowledge Objects with ownership/classification/approval; graph is a projection, never the system of record (KMOS-0201 §12). |
| Assets | `platform/assets` | Asset identity is independent of storage; integrity via checksums; evidence packages. |
| Capabilities | `platform/capability-registry`, `platform/capability-runtime`, `capabilities/*` | Capabilities depend only on the kernel contract; runtime executes them with no ambient authority. |
| Workflows | `platform/workflow` | Coordinates, never computes; preserves security context across long-running execution. |
| Events | `platform/events`, `packages/canonical-kernel/event-bus` | Append-only, validated, replayable; correlation/causation lineage on every event. |
| Applications | `applications/*` | Thin facades over platform/domain business APIs; replaceable; carry no business rules. |
| Extensions | (framework deferred — KMOS-0170) | Permission declaration / signing model specified, not yet built. |
| Connectors | `connectors/*` | Translate external → canonical; never bypass the platform (assets registered through the Registry). |
| Infrastructure | `platform/configuration`, adapters in `*/infrastructure/` | Secrets referenced, never inlined; infra confined to adapter directories by fitness checks. |

Each domain maintains independent trust boundaries per KMOS-0190 §5; cumulative trust
(KMOS-0190 §9) is derived — not assumed — by the Governance Service (see §7).

---

## 4. Identity model (KMOS-0190 §6)

**Every participating entity possesses a canonical identity** (KMOS-0190 §6), and
*"Anonymous entities SHALL NOT participate in governed operations."* The reference
implementation realises this directly.

- **Canonical identities for humans and non-humans alike.** `IDENTITY_KINDS`
  (`platform/identity/src/domain/identity.ts`) covers `Human`, `Organization`,
  `Application`, `PlatformService`, `Capability`, `AiWorker`, `Connector`, `Automation`,
  `ServiceAccount`. Non-human actors are **first-class** identities, not API keys bolted on.
- **AI workers are never anonymous.** `AiWorker` is an explicit identity kind; the helper
  `isNonHumanKind()` distinguishes administrative (human/org) from acting non-human kinds.
  Per KMOS-0008 and the M3 conformance record, AI participates as a *governed capability*
  under a canonical `AiWorker` identity, and its output is **non-authoritative until human
  review** — a human-in-the-loop control, not an availability control.
- **Attribution everywhere.** The canonical event envelope carries `actorId` (the identity
  on whose authority the fact occurred), so every fact in the append-only log is
  attributable. This satisfies the KMOS-0190 §18 audit requirement that records include
  *Identity*.
- **Organizations as the tenant boundary.** `Organization` is an identity subtype and the
  administrative/tenant scope; authorization is organization-aware (`AuthorizeQuery.organizationId`).

**Status: implemented.** Identity issuance, roles, permissions, delegation, sessions and
explainable authorization all exist in `platform/identity`. The *credential verification*
behind it is an in-memory adapter (see §5).

---

## 5. Authentication & authorization (KMOS-0190 §7, §8)

### 5.1 Authentication (§7)

Authentication is isolated behind the `AuthenticationPort`
(`authentication-port.ts`). The port deliberately exposes only a boolean `verify()` —
it returns no secrets and performs no policy — keeping **authn (who you are)** strictly
separate from **authz (what you may do)**. The application core issues a `Session` and emits
`AuthenticationSucceeded` / `AuthenticationFailed` canonical events (KMOS-0190 §20
authentication-event observability).

- **Today:** `InMemoryAuthenticationAdapter` stores credential secrets opaquely in a map,
  compares them on `verify()`, and never logs them.
- **Deferred to production:** an OIDC / Keycloak adapter with token introspection
  (RFC 7662) and federated authentication (KMOS-0190 §7), and SPIFFE/SVID workload identity
  for service-to-service authn (Readiness Report §7.7). Both slot behind the same port with
  no change to `IdentityService`.

### 5.2 Authorization (§8)

Authorization is **policy-driven and explainable**, matching KMOS-0190 §8's required inputs
(identity, role, organization, policies, classification, workflow state, approval status).

- **Model:** `Permission` (stable machine name, e.g. `knowledge.approve`), `Role` (bundles
  permissions), direct grants, and time-bounded auditable `Delegation`
  (`delegationConveys()` / `isDelegationActive()`).
- **Decision shape:** `AuthorizationDecision` returns `{ allowed, reason, identityId,
  permission }` — the *reason* (`role:Editor`, `direct-permission`, `delegation`) makes every
  decision auditable and explainable, the architectural intent of KMOS-0190 §8.
- **PDP/PEP/PAP direction (Readiness Report §7.3):** the decision logic is a deterministic
  Policy Decision Point; a thin Policy Enforcement Point lives in each service; policies are
  versioned, immutable artifacts in the Governance Service. An OPA/Cedar adapter may replace
  the evaluator behind the same port later.
- **ReBAC direction (Readiness Report §7.7):** the production target is a Zanzibar-style
  relationship-based model — `(object, relation, subject)` tuples with snapshot tokens,
  delegation via RFC 8693 on-behalf-of (`act` claim) — in a swappable authz store behind the
  PDP. The current role/permission/delegation model is the bootstrap that this evolves into;
  the SpiceDB/OpenFGA tuple store is **deferred-to-production**.

**Status: authn behind port (in-memory), authz model implemented; OIDC/IdP and ReBAC store deferred.**

---

## 6. Immutable audit & governance integration (KMOS-0190 §18, §24)

KMOS-0190 §18 requires that *every governed action produce immutable audit records*, and
§24 requires that security decisions *become part of institutional memory*.

- **Append-only history.** The event log (`InMemoryEventLog`) is append-only by construction:
  *"events are never updated or deleted."* Each `StoredEvent` carries a monotonic global
  `sequence` and a per-stream `streamVersion` (UNIQUE per `(streamId, version)`), modelling
  the production Postgres design (Readiness Report §7.1). Every meaningful change in every
  service publishes a canonical event, so the log *is* the audit trail.
- **Audit record completeness.** The canonical event envelope and the `GovernanceAudit`
  object together carry the §18 required fields: identity (`actorId`), timestamp (`time`),
  operation (`type`), knowledge/asset references (`relatedKnowledge` / `relatedAssets`),
  workflow/capability (`workflowId` / `capabilityId`), events, decision and outcome.
- **Evidence-driven governance.** The Governance Service (`platform/governance`, KMOS-0207)
  owns Policy/PolicyVersion, Approval, Review, Decision, Certification, ComplianceRecord,
  RiskAssessment, Exception and an immutable `GovernanceAudit`. Decisions preserve *reason,
  evidence, reviewer, authority, policy version and time*. Trust is **derived only from
  supplied evidence** (`deriveTrust()`): the score is the fraction of trust dimensions
  positively evidenced, mandatory dimensions (identity verification, policy compliance) must
  be present, and the result defaults to **NOT TRUSTED** — directly realising KMOS-0190 §9
  cumulative trust ("No single component establishes trust independently").
- **Security as institutional memory (§24).** Authentication/authorization outcomes are
  emitted as canonical events on the same log as business facts, so security history is
  replayable alongside everything else.

**Status: implemented (in-memory append-only log).** Production hardening adds the Postgres
event log, the transactional outbox, and WORM/Object-Lock for tamper-evident retention.

---

## 7. Event integrity & replay protection (KMOS-0190 §14)

KMOS-0190 §14 requires events to support integrity, authenticity, lineage, classification,
replay protection and auditability.

| §14 requirement | Realisation | Status |
|---|---|---|
| Integrity | Events are immutable facts; envelope validated against catalog + schema registry before publication (`EventService.validateEvent`). | Implemented |
| Lineage | Greg-Young correlation/causation triplet on every event (`eventId`, `correlationId`, `causationId`); correlation/causation query APIs. | Implemented |
| Classification | `EventClass` (`Institutional`/`Platform`/`Capability`/`Operational`) + `securityClassification` governance field. | Implemented |
| Replay protection (concurrency) | Optimistic concurrency on append: `expectedVersion` vs current stream version → `Conflict` on mismatch (`append-log.ts`). | Implemented |
| Replay protection (idempotency) | At-least-once delivery with idempotent consumers: per-subscriber processed-`eventId` dedup so each event is processed at most once (`event-bus/bus.ts`). | Implemented |
| Authenticity (cryptographic) | Event **signing** (per-event signatures / hash chaining) is **not** implemented; authenticity today rests on attributable `actorId` + append-only storage, not cryptographic signatures. | Deferred-to-production |
| Failure handling | Failed handlers are recorded as dead-letters, never silently dropped; DLQ is for human judgment. | Implemented |

The replay engine (`packages/canonical-kernel/event-bus/replay.ts`, exposed via
`EventService.replayEvents`) rebuilds projections from the immutable log by global sequence,
emitting `ReplayStarted` / `ReplayCompleted`. History is never mutated during replay.

**Note on "replay protection":** in KMOS this means two distinct things — (a) *concurrency*
protection (optimistic versioning, implemented) and (b) *idempotent consumption* so replays
and redeliveries do not double-apply effects (implemented). Cryptographic anti-tamper of the
log itself (signing / Merkle chaining) is the deferred piece.

---

## 8. Asset integrity, evidence & reproducibility (KMOS-0190 §11)

KMOS-0190 §11 requires assets to support encryption, integrity verification, access control,
retention, archival protection, replication, checksum validation and chain of custody.

- **Identity independent of storage.** An Asset's canonical id is a fresh `kmos:Asset:<uuid>`,
  never derived from a storage id, filename or path; `updateStorageReference` repoints storage
  without changing identity (`asset-registry-service.ts`; KMOS-0202 §11). This preserves
  evidentiary identity across storage migration.
- **Checksum integrity.** Integrity verification recomputes a content checksum via the
  `ChecksumPort` and compares it to the recorded `IntegrityRecord`. The reference adapter is
  SHA-256 over `node:crypto` (`Sha256ChecksumAdapter`) — already production-grade, no third-party
  dependency. This is the §11 "checksum validation" + "integrity verification" control.
- **Evidence packages & reproducibility.** The Registry produces `EvidencePackage` objects
  (content + matching checksum). The M3 acceptance evidence (IMPLEMENTATION_STATUS) records
  the end-to-end demonstration: *"Media now produces verifiable evidence (content + matching
  checksum) so Preservation integrity passes — demonstrating reproducible, preservable assets."*
  The production reproducibility target (DVC-style content-pinning of input hashes +
  capability/workflow versions, Readiness Report §7.8) is the next step.
- **Provenance & lineage.** The model carries Provenance, Lineage, RetentionRecord and
  ReplicationRecord (Readiness Report §6), aligned with W3C PROV-O.

| §11 requirement | Status |
|---|---|
| Checksum validation / integrity verification | Implemented (SHA-256) |
| Evidence packages / chain of custody | Implemented (evidence package; provenance/lineage modelled) |
| Identity stable across storage / archival protection | Implemented (identity ≠ storage) |
| Encryption (at rest / in storage) | Deferred-to-production (storage adapter responsibility) |
| Retention / WORM / legal hold | Partial (RetentionRecord modelled; S3 Object-Lock enforcement deferred) |
| Replication | Partial (ReplicationRecord modelled; multi-region replication deferred) |

---

## 9. Data protection & classification (KMOS-0190 §17, §19, §23)

- **What is protected (§17):** the canonical objects already model ownership, classification
  and retention for Knowledge and Assets; events carry `securityClassification`. Configuration
  secrets are **referenced, never stored in the clear**: the Configuration Service persists
  only a `SecretReference` pointer and resolves the clear value on demand through the
  `SecretResolver` port (`secret-resolver.ts`). Clear values live *only* in the adapter, never
  in a `ConfigurationVersion`.
- **Secret management:** today's `EchoSecretResolver` holds clear values in memory for
  dev/test. The production adapter is **HashiCorp Vault / cloud KMS** behind the same port,
  with no caller change. **Deferred-to-production.**
- **Compliance is configurable, not hardcoded (§19):** the Governance Service evaluates
  versioned policy rules; ComplianceRecord and framework are data, so institutional/legal/
  archival/privacy frameworks are expressed as policy (KMOS-0190 §19). Implemented as a
  deterministic evaluator; richer policy engines (OPA/Cedar) are an adapter swap.
- **Privacy (§23):** classification, retention and access policies are modelled; *enforcement*
  of data minimisation, deletion and export-control as runtime policy is **partial** — the
  hooks exist (classification + retention + policy evaluation) but production privacy adapters
  and deletion workflows are deferred.
- **Encryption-at-rest & in-transit:** neither is implemented in the reference build (in-memory
  stores, in-process dispatch). Both are **deferred-to-production**: encryption-at-rest is a
  storage/Postgres adapter concern; mTLS/TLS in-transit is a deployment concern (see §10
  threats T-5, I-3).

---

## 10. STRIDE threat model

Scope is the current modular-monolith reference implementation. Status reflects *what is in
the repo now*. "Deferred-to-production" means the architecture has a port/seam for the control
but the production adapter is not yet built — appropriate and expected at M5 entry.

### Spoofing

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| S-1 | Actor impersonates another identity (human or service). | Canonical identity per actor; authn behind `AuthenticationPort`; `Session` issuance + `AuthenticationSucceeded/Failed` events. | Partial — model implemented; real IdP/OIDC **deferred** |
| S-2 | Service/AI worker acts anonymously to evade attribution. | No anonymous participation (KMOS-0190 §6); non-human kinds are first-class identities; every event carries `actorId`. | Implemented |
| S-3 | Service-to-service call forged inside the platform. | Per-service identities + fitness-enforced boundaries. Cryptographic workload identity (SPIFFE/SVID, mTLS) **deferred**. | Partial / **deferred** |

### Tampering

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| T-1 | Audit/event history altered to hide an action. | Append-only log; events never updated/deleted; per-stream optimistic concurrency. | Implemented (in-memory) |
| T-2 | Cryptographic forgery of a stored event. | Event signing / hash-chaining of the log. | **Deferred-to-production** |
| T-3 | Asset bytes modified after registration. | SHA-256 checksum + `IntegrityRecord`; integrity verification recomputes and compares. | Implemented |
| T-4 | Tamper with retained/archival assets. | RetentionRecord modelled; WORM / S3 Object-Lock enforcement. | **Deferred-to-production** |
| T-5 | Data tampered at rest in the datastore. | Encryption-at-rest + DB integrity (Postgres adapter). | **Deferred-to-production** |

### Repudiation

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| R-1 | Actor denies performing a governed action. | Immutable audit + `GovernanceAudit`; `actorId` + reason on every decision; correlation/causation lineage. | Implemented |
| R-2 | Authorization decision cannot be explained after the fact. | `AuthorizationDecision.reason`; governance decisions preserve evidence/authority/policy-version/time. | Implemented |

### Information Disclosure

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| I-1 | Secrets leak via config or logs. | Secrets referenced not inlined (`SecretReference`); clear values confined to resolver adapter; credentials never logged. | Implemented (model); Vault/KMS backend **deferred** |
| I-2 | Sensitive knowledge/asset disclosed to unauthorised actor. | Classification + ownership + policy-driven authorization; org-scoped access. | Partial — enforcement points exist; full classification-aware ABAC **deferred** |
| I-3 | Data intercepted in transit. | TLS / mTLS between services and at the edge. | **Deferred-to-production** |
| I-4 | Data read from raw storage. | Encryption-at-rest. | **Deferred-to-production** |

### Denial of Service

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| D-1 | API flooded / abused. | Rate limiting, input validation, threat detection at the edge (KMOS-0190 §16). | **Deferred-to-production** (edge/gateway) |
| D-2 | Poison-pill event stalls a consumer. | Dead-letter handling + bounded delivery attempts; DLQ never auto-loops. | Implemented |
| D-3 | Unbounded resource use in capability execution. | WASI least-privilege sandbox + independent capability scaling (Readiness Report §7.4). | **Deferred-to-production** |

### Elevation of Privilege

| ID | Threat | Mitigation | Status |
|---|---|---|---|
| E-1 | Actor performs an action beyond its grants. | Deny-by-default authorization; explicit Permission/Role; explainable decision. | Implemented |
| E-2 | Stale or over-broad delegation abused. | Delegations are time-bounded, scoped and revocable (`isDelegationActive`, `delegationConveys`); auditable. | Implemented |
| E-3 | Capability/extension gains ambient authority. | Capabilities depend only on the kernel contract; runtime grants no ambient authority; cross-service imports forbidden by fitness checks. Extension permission/signing model (KMOS-0170) **not yet built**. | Partial / **deferred** |
| E-4 | AI output treated as authoritative without review. | AI is a governed capability; output non-authoritative until human review (KMOS-0008). | Implemented |

---

## 11. KMOS-0190 §25 conformance summary

| §25 conformance requirement | Status |
|---|---|
| Implement canonical identity | Implemented |
| Support authentication | Partial — port + in-memory adapter; real IdP deferred |
| Support authorization | Implemented (role/permission/delegation; ReBAC direction documented) |
| Maintain immutable audit records | Implemented (in-memory append-only log) |
| Protect Knowledge Objects | Partial — ownership/classification/approval modelled; full ABAC enforcement deferred |
| Protect Assets | Implemented (integrity/evidence); encryption/WORM deferred |
| Secure Capabilities | Partial — contract isolation implemented; WASI sandbox deferred |
| Secure Extensions | Deferred — extension framework (KMOS-0170) not yet built |
| Secure APIs | Partial — authn/authz/validation/audit; rate-limiting/threat-detection deferred to gateway |
| Publish security events | Implemented |
| Support governance | Implemented |
| Support disaster recovery | Partial — event-replay recovery implemented in-memory; durable store + DR runbook deferred (see OPERATIONS-GUIDE) |
| Support observability | Implemented (`@kmos/observability`: health/metrics/logging) |
| Remain implementation independent | Implemented (ports-and-adapters, fitness-enforced) |

Per KMOS-0190 §25, the unsupported/partial requirements above constitute this implementation's
declaration of partial conformance.

---

## 12. Remediation backlog (M5 production hardening)

Prioritised; each item closes a deferred control above and corresponds to a deferred adapter
behind an existing port.

| # | Item | Closes | Priority |
|---|---|---|---|
| 1 | Postgres event log + transactional outbox + `processed_events` dedup table | T-1, durable audit, DR | P0 |
| 2 | Real IdP: OIDC/Keycloak authn adapter + token introspection (RFC 7662); federated authn | S-1, authn conformance | P0 |
| 3 | Secret backend: Vault/KMS `SecretResolver` adapter | I-1, secret management | P0 |
| 4 | TLS in-transit + mTLS between services; SPIFFE/SVID workload identity | S-3, I-3 | P0 |
| 5 | Encryption-at-rest for datastore + object storage | T-5, I-4 | P0 |
| 6 | Event authenticity: signing / hash-chaining of the append-only log | T-2 | P1 |
| 7 | WORM / S3 Object-Lock + retention/legal-hold enforcement | T-4, retention | P1 |
| 8 | Classification-aware ABAC + ReBAC (Zanzibar tuples, SpiceDB/OpenFGA adapter; RFC 8693 delegation) | I-2, E-1 (depth) | P1 |
| 9 | API gateway: rate limiting, input validation, threat detection (KMOS-0190 §16) | D-1, API conformance | P1 |
| 10 | Capability sandbox: WASI least-privilege isolation + resource limits | D-3, E-3 | P1 |
| 11 | Extension security framework (KMOS-0170): permission declaration, publisher identity, signing/certification | E-3, extension conformance | P2 |
| 12 | Privacy enforcement adapters: deletion workflows, export control, data-minimisation policy | §23 privacy | P2 |
| 13 | Security observability hardening: SIEM export of security events, threat-indicator metrics, decision-log retention | §20 | P2 |
| 14 | Multi-region asset replication enforcement (ReplicationRecord) | replication | P2 |

---

## 13. References

- **KMOS-0190** Security & Trust Architecture — §3 (philosophy), §4 (principles), §5 (trust
  domains), §6 (identity), §7 (authn), §8 (authz), §9 (trust model), §11 (asset security),
  §14 (event security), §16 (API security), §17 (data protection), §18 (audit), §19
  (compliance), §20 (security observability), §23 (privacy), §24 (governance integration),
  §25 (conformance).
- **KMOS-0010** Technical Reference Architecture — service & deployment model.
- **KMOS-0008** AI Collaboration & Human Governance Framework — AI non-authoritative-until-review.
- **KMOS-0201 §12** — Knowledge graph is a projection, never the system of record.
- **KMOS-0202 §11/§15** — Asset identity independent of storage; checksum/integrity.
- **KMOS-0203 §14** — Event replay.
- **KMOS-0206 / KMOS-0207** — Identity Service / Governance Service specifications.
- **Engineering corpus:** `engineering/KMOS-ENGINEERING-READINESS-REPORT.md` (§7 research
  techniques, §10.8 deployment), `engineering/DECISIONS.md` (D-006 ports-and-adapters, D-B
  persistence), `engineering/IMPLEMENTATION_STATUS.md` (M3 acceptance evidence),
  `constitution/CODING-CONSTITUTION.md` (§2 ports, §4 dependency direction, §5 events).
