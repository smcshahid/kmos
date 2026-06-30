# KMOS — Knowledge & Media Operating System

KMOS is an operating system for **institutional knowledge**. Knowledge is the
permanent asset; media, applications, and AI are replaceable representations and
tools. This repository is the reference implementation, built strictly to the
KMOS specification corpus and Constitution.

> **Status: v1.0 Release Candidate (library-grade).** The full platform core is
> implemented and green (210 tests, 0 architecture-fitness violations), runs as an
> HTTP server with a reference web UI (`npm run serve`), and a
> complete knowledge lifecycle runs end-to-end (`npm run demo`). Production
> hardening that requires a networked, type-checked, database-backed CI
> environment — the async-kernel migration (KEP-001), real Postgres/OIDC/Vault,
> an HTTP API server, and a web UI — is staged and planned, not yet shipped. See
> `engineering/IMPLEMENTATION_STATUS.md` for the precise gap ledger.

## Quickstart (Node 22+)

```bash
npm run verify:offline   # architecture-fitness + full test suite (no network)
npm run demo             # end-to-end knowledge lifecycle on the live platform
npm run health           # platform health dashboard (all services + bus)
npm run seed             # create a sample organization with starter knowledge
npm run serve            # start the HTTP API server + reference web UI (http://localhost:8080)
```

No build, install, or database is required for the above (the dev runner executes
the TypeScript sources directly — see `documentation/DEVELOPER-GUIDE.md`).

## What works today (verifiable now)

- The **seven Foundational Institutional Engines** + Configuration + Search, as
  in-process services with a single canonical event bus, append-only event log,
  and replay.
- **Capabilities → Domains → Applications** composition; a reference capability
  library; 5 domain services; 6 thin applications.
- A **runnable end-to-end demo**: org+identity → media import → language/knowledge
  → governance approval → publication → preservation → search → lineage →
  explainable trust → institutional audit rebuilt by replay (0 dead letters).
- **Security enforcement mechanism** (attribution + authorization + tenancy) at
  the canonical event chokepoint, with a dedicated security test suite.
- Full **architecture-fitness** gates and a **205-test** suite (unit, contract,
  event, replay, resilience/DR, migration, performance, concurrency, security,
  integration, certification).

## Staged for the production cycle (needs CI/networked env)

- **KEP-001** async `EventLog` kernel migration (the freeze prerequisite) — plan
  in `engineering/review/07-KERNEL-EVOLUTION-PLAN.md`.
- Pervasive identity threading, real PostgreSQL persistence, real OIDC/JWT/
  mTLS/SPIFFE/Vault/encryption, an HTTP API server, and a reference web UI.

## Documentation

`documentation/` — Architecture, Developer, Deployment, Security, Operations,
Capability-Development, Workflow-Development, Troubleshooting, Migration guides,
Release Notes, and ADRs. Engineering history, decisions, risks, and certification
reviews live in `engineering/` and `engineering/review/`.

## Repository layout

Architectural, not technological (KMOS-10020): `packages/` (canonical kernel),
`engines/`, `platform/` (the services), `capabilities/`, `domains/`, `connectors/`,
`applications/`, `testing/`, `documentation/`, `deployment/`, `examples/`,
`specifications/`, `constitution/`.

## Authority

The KMOS Constitution and specification series are the highest authority. This
implementation preserves that architecture; it does not redesign it.
