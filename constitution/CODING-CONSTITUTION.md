# KMOS Coding Constitution

_Development standards for the KMOS reference implementation. Derived from KMOS-9999 §21, KMOS-10005, KMOS-10020. Enforced by `tools/fitness-checks` + ESLint + code review._

## 1. Layering (every service)
Separate four layers; dependencies point inward only:
- **api/** — transport (REST/OpenAPI, event subscriptions). No business rules.
- **application/** — use-cases orchestrating the domain. No transport, no SQL.
- **domain/** — canonical business model + rules. **Zero infrastructure imports.**
- **infrastructure/** — adapters: storage (Postgres), broker, IdP, AI models, connectors. The only place infra modules (`pg`, brokers, etc.) may appear.

## 2. Ports and adapters
Storage, message broker, identity provider, and AI models are accessed through **ports** (interfaces in `domain`/`application`) implemented by **adapters** in `infrastructure`. The domain core never imports a database driver. This is what keeps technology replaceable (KMOS-9999 §9–§13, §28).

## 3. Canonical types are sacred
Import all canonical objects, the event envelope, schemas, and the event catalog from `@kmos/canonical-kernel`. **Never redefine a canonical object or invent an event name.** New canonical types/events are added to the kernel via review, never ad hoc (KMOS-9999 §7; risk R-02).

## 4. Dependency direction (enforced)
`applications → domains → capabilities → engines/platform → packages`. Imports may only point down the stack. No platform service imports another platform service's internals — cross-service contact is **canonical events + business APIs** only. Reverse dependencies require a logged ADR in `documentation/adr/` (the canonical ADR home; `architecture/` holds derived diagrams only).

## 5. Events
Every meaningful business change publishes a canonical event (past-tense fact). Events are immutable, validated before publication, idempotently consumed, and replayable. Business logic never lives in events, workflows, or applications — only in capabilities/domain services.

**Await-everywhere publication (KEP-001 / Decision KEP-D1).** The kernel `EventLog` port is asynchronous (one port, satisfied by the in-memory and Postgres adapters alike). Every event-emitting write path is `async` and **must `await` publication** — `void this.emit(...)` / `void this.publish(...)` (fire-and-forget) is prohibited and enforced by architecture-fitness rule (5). The sole exception is a constructor (which cannot `await`); it must carry an explicit `fitness-allow-fire-and-forget` justification. This makes in-process semantics identical to real async storage and keeps event capture deterministic.

## 6. Determinism & replay
No clocks, randomness, or IO in deterministic cores (workflow coordination, projections). Push non-determinism to adapters. Every service ships replay tests.

## 7. Testing (Definition of Done)
Per KMOS-9999 §16: unit, integration, contract, event, workflow, migration, performance, replay, governance, acceptance. A work package is "done" only when it is production-ready (tests green, docs complete, events validated, observability + governance in place, deployment verified) — not when it merely compiles (KMOS-9999 §22).

## 8. Style
Explicit interfaces over implicit behavior; composition over inheritance; no shared mutable state; no circular dependencies; small focused commits that keep the repository understandable after every change (KMOS-9999 §21, §27).

## 9. Evidence
Every significant engineering decision is recorded in `engineering/DECISIONS.md` (ADR). Future engineers must be able to learn the architecture from the repository itself (KMOS-10020).
