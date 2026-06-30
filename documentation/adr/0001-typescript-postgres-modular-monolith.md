# ADR 0001 — TypeScript, Postgres-first, modular-monolith-first

## Status

**Accepted** (human approval, 2026-06-30). Consolidates `DECISIONS.md` D-A, D-B,
D-C.

## Context

KMOS needs a primary technology stack, a persistence approach, and a deployment
shape. These are product-level, expensive-to-reverse choices that shape every
service, so they required explicit human approval. The constitution favors
institutional longevity, minimal dependencies, and architectural (not
technological) boundaries (KMOS-10020, KMOS-0200 §17).

## Decision

- **Language (D-A):** **TypeScript** (Node.js, strict) for platform services, the
  SDK, and thin applications. Python is reserved for AI/media capability workers,
  with the capability contract as the boundary. Monorepo via npm workspaces on
  **Node 22**.
- **Persistence (D-B):** **PostgreSQL-first, polyglot-by-projection** — event log
  + transactional outbox + relational + JSONB + pgvector + AGE/CTE graph, all
  behind repository **ports**. Specialized stores are slotted in later behind the
  same ports.
- **Deployment shape (D-C):** **Modular monolith first**, extractable to
  independently deployable services behind identical contracts (KMOS-0200 §17).
  In-process event dispatch is used first so no service hard-depends on a running
  broker.

## Consequences

- A single language across the platform core keeps boundaries clean and the SDK
  cohesive; capability workers can still be polyglot behind the contract.
- Postgres-first lets one engine cover relational, document, vector, and graph
  needs early; the port discipline (ADR 0003) keeps it replaceable.
- The modular monolith gives an acyclic startup and a simple offline dev/run
  story; the contract-first boundaries preserve the option to extract services
  without redesign.
- The Node-22 + npm-workspaces choice enables the offline dev runner
  (`--experimental-strip-types`) used by the test/demo flows (see `DECISIONS.md`
  D-E).
