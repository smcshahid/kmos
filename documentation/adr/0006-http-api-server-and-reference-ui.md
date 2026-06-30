# ADR 0006 — HTTP API server + reference web UI (node:http, zero-dependency)

## Status
Accepted (implemented, live-tested).

## Context
KMOS was library-grade: in-process services + programmatic facades. To be an
operating *platform* a new engineer can install, run, and exercise, it needs a
runnable server and a UI — without violating the offline/zero-dependency
constraints (blocked npm registry) or the architecture.

## Decision
Implement `@kmos/api-server` using Node's built-in `node:http` (zero runtime
dependencies). It composes the platform on one shared canonical event bus and
exposes canonical business operations over REST (KMOS-0180), and serves a
self-contained vanilla-JS reference UI at `/`. Errors map to HTTP status via the
canonical `KmosError` taxonomy. Attribution travels via `x-kmos-actor` /
`x-kmos-organization` headers (wired to an enforcing `CallContext` in production).

## Consequences
- KMOS is now runnable (`npm run serve`) and evaluable via a browser/HTTP, with
  live HTTP tests as evidence (4/4) and a published OpenAPI description.
- No new third-party dependency is introduced; the server is an `applications/`
  edge that contains no business logic (fitness-clean).
- The server currently runs on the in-memory platform; it inherits the staged
  items (async kernel KEP-001, real persistence, real auth) — when those land in
  CI, the same server runs unchanged over production adapters.
