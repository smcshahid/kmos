# ADR 0003 — Ports and adapters (infrastructure behind ports)

## Status

**Accepted.** From `DECISIONS.md` D-006. Enforced by architecture-fitness
(`tools/fitness-checks/run.mjs`).

## Context

KMOS must keep institutional knowledge and domain logic independent of any
particular storage engine, broker, identity provider, or AI model. If
infrastructure leaks into domain cores, the platform couples to vendors, replay
determinism is threatened (R-04), and storage coupling spreads past intended
boundaries (R-07). The constitution mandates architectural (not technological)
boundaries.

## Decision

Adopt **ports-and-adapters (hexagonal) architecture**: domain cores have **zero
infrastructure imports**. PostgreSQL, object storage, message brokers, identity
providers, and AI models are all **adapters behind ports**. Concretely:

- Infrastructure modules (`pg`, `postgres`, `kafkajs`, `nats`, `amqplib`,
  `ioredis`, `mongodb`) may only be imported inside an `infrastructure/`
  directory.
- The canonical kernel imports **no** infrastructure (kernel purity; see ADR
  0002 / D-F).
- The kernel defines the `EventLog` port; `InMemoryEventLog` and the Postgres
  adapter both implement it. The Postgres adapter sits behind a `SqlClient` port
  and imports no `pg` directly, proving storage replaceability.

These rules are automated as fitness gates: `[kernel-purity]` and
`[ports-adapters]` violations fail `npm run fitness` and CI.

## Consequences

- Domain cores are testable and replayable without real infrastructure; the
  offline test/demo flows run with in-memory adapters.
- Storage and brokers are genuinely replaceable behind ports (modular-monolith-
  first, ADR 0001); the same port pattern is reused for every service's Postgres
  adapter when deployed.
- Adding infrastructure means writing an adapter in `infrastructure/`, never
  importing infra into a domain core.
- Note: the *synchronous* `EventLog` port currently cannot be satisfied by async
  storage on the *same* port — addressed by ADR 0004 (KEP-001).
