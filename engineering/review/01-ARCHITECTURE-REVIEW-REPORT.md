# KMOS Core v1 — Architecture Review Report

**Reviewer:** Chief Certification Engineer (independent)
**Date:** 2026-06-30
**Method:** Direct source inspection of the repository (169 source modules, 38 test suites), the architecture-fitness tool, and the kernel contracts. Claims in the implementation team's certification report were treated as hypotheses to verify, not as evidence.

---

## 1. Scope & approach
This report evaluates the *structure* and *internal consistency* of KMOS Core v1 against the architectural intent in KMOS-0001–0010, KMOS-0100–0200, KMOS-10020 (Repository Constitution), and KMOS-10050 (Atlas). Constitutional clause compliance is in doc 02; debt in doc 03; production readiness in doc 04.

## 2. Overall architectural assessment
The implementation is a **faithful structural realization of the KMOS architecture**. The layering, ownership model, and event-driven backbone match the specifications closely. The most important architectural risks are not in the *shape* of the system but in two **contract-level** decisions in the kernel and the service API surface that are expensive to change after a freeze.

**Grade: B+ structurally; the kernel/API contract issues (CRIT-1, CRIT-2) are the gating concerns.**

## 3. Strengths (evidence-based)
- **Single ownership of canonical objects.** Each canonical object type maps to exactly one owning service (`KMOS-10030` honored); cross-service contact is via events + business APIs. The one fitness rule that works (cross-service imports) confirms no platform service imports another's internals.
- **Zero-dependency kernel** (`packages/canonical-kernel`) with an immutable, append-only event log (`UNIQUE(stream_id, version)` semantics), per-aggregate ordering, a 3-section envelope with correlation/causation, and a first-class replay engine that records replay metadata separately from history. This is the strongest part of the system and matches KMOS-0110/0203 intent well.
- **Ports-and-adapters discipline** is real in the domain cores: storage, secrets, IdP, AI handlers, and broker are interfaces; in-memory adapters live under `infrastructure/`.
- **Deterministic core (mostly).** Clocks are injected via `now()` across services; replay and workflow reconstruction are deterministic. (Two leaks noted in doc 03, MED-4.)
- **Composition over inheritance**, explicit relationships by identifier, and thin applications that read through services (verified structurally for all six apps).
- **Governance audit is genuinely append-only** (`InMemoryAuditRepository` exposes only `add`/read).

## 4. Architectural weaknesses & deviations

### 4.1 CRIT-1 — The kernel `EventLog` port is synchronous (foundational)
`packages/canonical-kernel/src/event-bus/append-log.ts` defines `EventLog` with **synchronous** methods (`append`, `read`, `size` return values, not promises). `replay()` and the bus iterate it synchronously, and ~5 services call `bus.eventLog.read(1).filter(...)` synchronously.

A real database is asynchronous. The Postgres adapter therefore **could not implement the kernel port** — it implements a *separate* `AsyncEventLog` interface (`platform/events/src/infrastructure/postgres-event-log.ts`, line 58/124). **Consequence:** the headline claim "storage is replaceable behind the kernel port" is **false for the most important port.** Real persistence requires making the kernel event log async, which is a **breaking change** to the kernel, `replay`, the bus, and every consumer. This is the single biggest architectural finding and is the primary reason a freeze is premature.

### 4.2 CRIT-2 — Identity is architecturally disconnected (no enforced authn/authz/attribution)
The Identity service is well built, but **nothing calls it.** Write APIs (`createKnowledge(input)`, `registerAsset(input)`, `requestApproval(input)`, …) accept **no actor/authentication context.** Across services + domains, **0 of 14 `createEvent` calls populate `actorId`** (the lone exception is the AI worker identity in ai-collaboration). So:
- No action is authenticated or authorized at the service boundary (violates KMOS-9999 §15, KMOS-0190).
- Canonical events carry no actor → "who performed this action" (KMOS-0206 accountability) is unanswerable in practice; the audit trail is anonymous.

This is an *architectural integration gap*, not just a missing feature: closing it changes write-API signatures (an actor/authz context parameter) — breaking, hence pre-freeze.

### 4.3 HIGH-3 — Architecture-fitness "dependency direction" is largely unenforced
`tools/fitness-checks/run.mjs` `layerOfPackage()` only recognizes `@kmos/canonical-kernel`; for any other `@kmos/*` import it returns `undefined`, so the dependency-direction rank check is skipped. **Net effect:** only imports of the kernel are direction-checked. A capability importing an application, or a domain importing another domain, would **not** be flagged. The cross-service rule (platform↔platform) works and is valuable, but the broadly-advertised "dependency direction enforced across all layers" is **overstated**. (The system happens to comply, but the guard does not prove it.)

### 4.4 Domain↔platform coupling is compile-time, not contract-time
Domains import concrete service classes (e.g., `domains/media` imports `WorkflowService`, `CapabilityRuntimeService`). This is acceptable for the modular-monolith phase and the dependency direction is legal, but it is **in-process class coupling**, not the event/business-API coupling the Atlas envisions for extracted services. When services are extracted, these call sites must become network/business-API calls. Not a violation today; a migration cost to record.

### 4.5 Event vocabulary is fragmented (MED-5)
Canonical event types live in the kernel seed *plus* five per-service local catalogs *plus* a duplicating `engines/platform-catalog`. The Constitution wants **one** authoritative event catalog (KMOS-10040). Today there are effectively three sources of truth, reconciled only by a hand-maintained merge. This is drift-prone and should be consolidated into the kernel before freeze.

## 5. Architectural intent: where the build honors vs. bends it
| Intent (spec) | Status |
|---|---|
| Knowledge before applications; apps thin/replaceable | Honored (apps verified thin) |
| Events are immutable facts; replayable | Honored (kernel + replay + DR test) |
| Capabilities hold all business logic; workflow coordinates | Honored (capability-execution events prove work runs in capabilities; workflow has no compute) |
| Single authoritative owner per object | Honored |
| Technology replaceable behind ports | **Bent** — true for storage *conceptually*, but the kernel event-log port is sync and unsatisfiable by real storage (CRIT-1) |
| Identity before permissions; every action authenticated/authorized/attributable | **Violated in practice** (CRIT-2) |
| One canonical event catalog | **Bent** — fragmented (MED-5) |
| Governance explainable + auditable | Honored (append-only audit; explainable trust) |

## 6. Recommendation (architecture)
The architecture is sound and worth standardizing — **after** correcting the two contract-level issues (CRIT-1 async kernel log; CRIT-2 actor/authz context on write APIs) and consolidating the event catalog (MED-5), because all three are breaking changes that a freeze would otherwise ossify. Strengthen the fitness checker (HIGH-3) so the freeze is guarded by a guard that actually works. Details and sequencing in doc 05.
