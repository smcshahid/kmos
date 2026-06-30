# ADR 0002 — Canonical kernel as single source of truth for objects & events

## Status

**Accepted.** Consolidates `DECISIONS.md` D-005 and D-F, plus the MED-5 catalog
consolidation (`engineering/review/06-REMEDIATION-CERTIFICATION-REPORT.md`).

## Context

Canonical objects and canonical events are defined across multiple specification
documents (KMOS-0100/0110/0130/0140 + catalogs 10030/10040). Without one
authoritative definition, services drift: each redefines objects or registers its
own event types, producing the canonical-object/event-drift risk (R-02). Early
milestones had event types fragmented across the kernel seed, five service-local
catalogs, and a duplicating platform-catalog.

## Decision

- **Single source of truth (D-005):** Author field-level JSON Schemas and the
  canonical definitions in `packages/canonical-kernel`. All services **import**
  from the kernel; **none redefine** canonical objects or events.
- **Zero runtime dependencies (D-F):** The kernel ships with no runtime
  dependencies, including a small deterministic JSON-Schema-style validator
  instead of a library. A specialized validator may later be added behind the
  same `validate()` interface.
- **One event catalog (MED-5):** All canonical event **types** are consolidated
  into the kernel catalog seed — **97 types** — as the single vocabulary. Only
  catalogued types may be published through the bus. Service `create*Catalog()`
  factories become idempotent shims over the kernel default.

## Consequences

- Eliminates object/event drift (R-02) and enforces "one catalog" (KMOS-10040).
- Determinism: a dependency-free validator keeps validation reproducible for
  replay and governance, and keeps the kernel safe to import everywhere.
- Adding a new event type is a single edit to the kernel catalog seed (a `def(...)`
  entry); per-service local catalogs are prohibited. Publishing an uncatalogued
  type raises `Unregistered canonical event type: ...`.
- Residual: service-local extra arrays remain as harmless compatibility shims and
  can be deleted later.
