# KMOS — Decisions Log (ADRs, reconciliations, assumptions)

_Living document. Every architectural decision, reconciliation, and assumption is recorded here for institutional memory (KMOS-10005 Lesson 10)._
_Last updated: 2026-06-30_

## Status legend
PROPOSED — awaiting human approval · ACCEPTED — confirmed · SUPERSEDED

---

## D-001 — Treat constitution + specifications as one corpus, reconcile conflicts
**Status:** ACCEPTED (per user direction, 2026-06-30).
**Decision:** Treat the constitutional documents and the numbered specifications as a single authoritative corpus. Reconcile conflicts; use KMOS-9999 §28 precedence only as a tie-breaker.
**Consequence:** No redesign; conflicts documented, not resolved by fiat.

## D-002 — Layer-A bootstrap micro-order
**Status:** ACCEPTED (engineering decision; non-architectural).
**Context:** The five foundational engines have latent mutual dependencies (Readiness Report §3.2).
**Decision:** Build order inside M1: canonical kernel → Event Service → Identity → Asset Registry + Knowledge → Governance. Use in-process event dispatch first so no service hard-depends on a running broker. Seed a "platform-root" identity + per-service service accounts.
**Consequence:** Acyclic startup; broker remains optional/replaceable.

## D-003 — Adopt KMOS-10020 repository tree
**Status:** ACCEPTED.
**Context:** KMOS-9999 §5 and KMOS-10020 give slightly different layouts.
**Decision:** Use the richer KMOS-10020 tree (the dedicated Repository Constitution). Both permit evolution while preserving boundaries.

## D-004 — Seven engines + Configuration + Search = canonical core
**Status:** ACCEPTED.
**Context:** "seven engines" (dossier) vs "nine services" (KMOS-0200).
**Decision:** Seven engines are the permanent foundation; Configuration and Search are required platform services completing the core. Different granularities, no conflict.

## D-005 — Canonical kernel as single source of truth for objects/events
**Status:** ACCEPTED.
**Decision:** Author field-level JSON Schemas in `packages/canonical-kernel` (M0), derived strictly from KMOS-0100/0110/0130/0140 + catalogs 10030/10040. All services import from the kernel; none redefine canonical objects/events. This is operationalization of existing specs, not redesign.

## D-006 — Storage/broker/IdP/model behind ports (ports-and-adapters)
**Status:** ACCEPTED.
**Decision:** Domain cores have zero infrastructure imports. Postgres, object storage, message broker, identity provider, and AI models are all adapters behind ports. Enforced by architecture-fitness checks.

## D-007 — Align canonical generic defaults with their bound (type soundness)
**Status:** ACCEPTED (implemented; CI green). Recorded as ADR-0008.
**Context:** The first real `tsc --build` (board review R-A) exposed 65 type errors. Dominant root cause (~58 sites): canonical generics bounded at `extends object` but defaulted to `Record<string, unknown>`; concrete bodies are `interface`s, which satisfy the bound but not the index-signature default.
**Decision:** Align the default with the bound (`= object`); bound unchanged. Compile-time only — no runtime/event-format/data change. Safe: nothing indexes `body`/`payload` by arbitrary key. Also complete the canonical `AssetType` union with `'Media'`/`'Publication'` (KMOS-0202). Non-canonical fixes same pass: regeneralize `IdentityService.require`; add optional `InvocationContext.organizationId`; minor lint.
**Consequence:** Clean `tsc`; CI static/tests/database green; board-review R-A closed. Canonical bodies stay strongly-typed interfaces; arbitrary-key body access disallowed by convention. Taken pre-Architecture-Freeze v1.0.

## D-008 — Asynchronous EventLog kernel migration (KEP-001, resolves CRIT-1)
**Status:** ACCEPTED (implemented; merged to main #1; CI green incl. real-Postgres). Recorded as ADR-0009.
**Context:** The kernel `EventLog` port was synchronous, so the production `PostgresEventLog` had to implement a *separate* `AsyncEventLog` — the authoritative port was not database-satisfiable (CRIT-1). A typechecked + Postgres CI environment (now present) makes the async propagation safe to land atomically.
**Decision (KEP-D1/D2):** Make `EventLog` + `replay()` async; `bus.publish` awaits append. Adopt the **await-everywhere** contract — every emit path awaits publication; fire-and-forget is banned by fitness rule (5), with one justified constructor exemption. `InMemoryEventLog` and `PostgresEventLog` implement the same async port (`AsyncEventLog` → deprecated alias). Land atomically, gated by green tsc + tests + a real-Postgres contract run. No persisted-format change; no data migration.
**Consequence:** CRIT-1 + HIGH-1 closed with evidence (real-PG contract green in CI). Determinism strengthened (publication-ordering test). Adversarial review caught 6 production await gaps a stale incremental build had hidden — all fixed under a clean build. Ships `PgSqlClient` production wiring. Architecture Freeze v1.0 now eligible on this axis, pending human sign-off.

## D-009 — Olares Application Chart as the reference self-hosted deployment
**Status:** ACCEPTED (validated on real Olares). Recorded as ADR-0010.
**Context:** KMOS needed a first real, reproducible self-hosted target. The server also didn't honour `KMOS_DATABASE_URL` (ran in-memory regardless) — fixed via `createPlatformFromEnv`.
**Decision:** The Olares Application Chart (`deployment/olares/`, Helm + OlaresManifest) is the reference self-hosted deployment; KMOS owns its constitutional core and consumes Olares-managed PostgreSQL for the durable event log; image published to public Docker Hub by `release-image.yml`; `replicas: 1` until read-model persistence lands; the artifact ports to K8s/cloud by changing only the adapter.
**Consequence:** Validated on real Olares (`mwayolares`) — install accepted, Postgres provisioned, full workflow ran, durable log survived an app restart (77→79 events). The largest operational gap (in-memory only) is closed with evidence. The final pre-GA engineering blocker is now precisely: repository-backed read-model recovery on boot (review/18 §5–§6).

---

## Decisions REQUIRING HUMAN APPROVAL (irreversible / product-level)

## D-A — Primary platform technology stack (language)
**Status:** ACCEPTED (human approval, 2026-06-30).
**Decision:** TypeScript (Node.js, strict) for platform services + SDK + thin apps; Python reserved for AI/media capability workers (capability contract is the boundary). Monorepo via npm workspaces (Node 22).
**Why it matters:** Shapes every service; expensive to reverse.

## D-B — Persistence approach
**Status:** ACCEPTED (human approval, 2026-06-30).
**Decision:** PostgreSQL-first polyglot-by-projection (event log + outbox + relational + JSONB + pgvector + AGE/CTE graph), all behind repository ports; specialized stores slotted later.

## D-C — Deployment shape first
**Status:** ACCEPTED (human approval, 2026-06-30).
**Decision:** Modular monolith first, extractable to independently deployable services behind identical contracts (KMOS-0200 §17).

## D-E — Test runner: Node built-in (node:test), not vitest
**Status:** ACCEPTED (engineering decision, M0, 2026-06-30).
**Context:** The sandbox npm registry is blocked (403), and the constitution favors minimal dependencies and institutional longevity.
**Decision:** Use Node 22's built-in test runner (`node:test` + `node:assert`) with `--experimental-strip-types` and a tiny dev-only `.js`->`.ts` resolver hook (`tools/dev/`). Zero external test dependencies; sources keep spec-correct NodeNext `.js` import specifiers; the shipped build is produced by `tsc`.
**Consequence:** `npm test` and `npm run fitness` run fully offline. `npm run lint`/`typecheck` (eslint/tsc) require `npm ci` and run in CI where the registry is reachable.

## D-F — Kernel has zero runtime dependencies
**Status:** ACCEPTED (M0).
**Decision:** `@kmos/canonical-kernel` ships with no runtime dependencies — including a small deterministic JSON-Schema-style validator instead of a library (e.g. Ajv). A specialized validator MAY be added later behind the same `validate()` interface.
**Rationale:** Determinism for replay/governance; longevity; the kernel is imported by every service.

## D-D — Multi-tenancy isolation (deferrable to M1)
**Status:** PROPOSED (default).
**Recommendation:** Shared-schema with mandatory org-id scoping behind repository ports.
**Alternatives:** Schema-per-tenant; database-per-tenant.

---

## Assumptions (to revisit if contradicted)
- A-01: Prior systems "Media Pipeline" / "AIMPOS" are not available in this workspace; implement from specs. (Readiness Report §5 item 5.)
- A-02: Event delivery is at-least-once; all consumers idempotent. (KMOS-0110/0203.)
- A-03: The Knowledge Graph and all search indexes are projections, never the system of record. (KMOS-0201 §12, KMOS-0130 §18.)

---

## Phase 1 research sources (techniques only; architecture NOT imported)
- **Event/messaging:** EventStoreDB/Kurrent docs; Confluent (schema evolution, exactly-once); Kafka delivery semantics; NATS JetStream; CloudEvents spec; Transactional Outbox + Debezium; Greg Young / Arkency correlation-causation; Rails Event Store; DLQ patterns.
- **Workflow/policy/capability:** Temporal docs (event history, versioning, patching, worker versioning); Netflix Conductor; Apache Airflow DAGs; AWS Step Functions / saga orchestration; Open Policy Agent (Rego, decision logs, bundles); AWS Cedar; Protobuf/buf breaking rules; WASI component model & sandbox; ORAS/OCI artifacts; Backstage software catalog.
- **Knowledge/search/identity/provenance:** Neo4j/openCypher; W3C RDF-star & PROV-O; SQL:2011 bitemporal; XTDB/Datomic; Apache AGE; CQRS/Marten projections; entity resolution (Zingg/Splink); OpenSearch/Elasticsearch; pgvector/FAISS/HNSW; Reciprocal Rank Fusion; Keycloak; OIDC/OAuth2; SPIFFE/SPIRE; Google Zanzibar / SpiceDB / OpenFGA; RFC 7662/8693; IPFS/Merkle; in-toto/Sigstore; OpenLineage; S3 Object Lock; Apache OpenDAL; DVC.
