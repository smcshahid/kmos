# KMOS-0208 (DRAFT) — Search & Discovery Service

Status: DRAFT (authored by implementation agent; pending governance review). KMOS-0207 names KMOS-0208 as "next"; this fills that gap.
Derived from: KMOS-0200 §5, KMOS-0180 §13, KMOS-0130 §17, KMOS-0140 (discovery), KMOS-0110 (event-driven projections), KMOS-0190 (governed access).

## 1. Purpose
Make canonical objects discoverable across the platform — semantic, evidence-aware, governance-aware — for humans, applications, workflows, and AI collaborators, while respecting security/provenance/trust. Search indexes are PROJECTIONS, never the system of record (KMOS-0130 §18); they are rebuilt from canonical events.

## 2. Owned canonical objects
SearchIndex, IndexedDocument (a projection record), SearchQuery (optional, for audit). Owner: SearchService.

## 3. Responsibilities
- Build indexes as event-driven projections: subscribe to canonical events (KnowledgeCreated, AssetRegistered, CapabilityRegistered, etc.) and upsert IndexedDocuments idempotently (upsert-by-canonical-id; at-least-once safe).
- Query across object types with filters (type, organization, classification, tags) — keyword (token/BM25-style scoring) plus optional vector similarity, fused by Reciprocal Rank Fusion (k=60) for hybrid search (Readiness Report §7.6).
- Rebuild any index from the event log via the kernel replay (`Projection`) — zero-downtime swap via alias (atomic pointer), index untouched on read.
- Governance-aware: results filtered by the caller's authorization/classification (integrates with Identity/Governance via injected ports).

## 4. Events
IndexCreated, KnowledgeIndexed, AssetIndexed, IndexRebuilt. (Local catalog extension until promoted to KMOS-10040.)

## 5. Ports
IndexStore (in-memory inverted index + optional vector store now; OpenSearch/pgvector later), Embedder (optional; deterministic stub now), AccessFilter (authz).

## 6. Acceptance
Cross-object discovery; event-driven idempotent indexing; keyword + hybrid ranking; rebuild-by-replay with atomic swap; governance-aware filtering; canonical-object-authoritative (index regenerable). Tests cover indexing from events, keyword + hybrid query, idempotent re-index, rebuild-from-replay, and access filtering.
