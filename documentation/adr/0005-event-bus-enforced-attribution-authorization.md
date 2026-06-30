# ADR 0005 — Event-bus enforced attribution & authorization

## Status

**Accepted (mechanism delivered & tested).** Pervasive per-service wiring is
deferred to the CI-guarded cycle (co-executed with ADR 0004). From issue
**CRIT-2** / **HIGH-2** in
`engineering/review/06-REMEDIATION-CERTIFICATION-REPORT.md`.

## Context

Originally, write APIs took no actor, 0/14 service event emissions set `actorId`,
the Identity service was disconnected from writes, and the audit trail was
anonymous — violating attribution and authorization requirements (§15,
KMOS-0206). Multi-tenancy was carried (`organizationId`) but not enforced, so
cross-tenant reads/writes were possible (HIGH-2). Threading an actor through every
write API is the same breaking ripple as the async migration (ADR 0004), so it
could not be completed safely offline.

## Decision

Enforce attribution, authorization, and tenancy at the **single canonical
chokepoint — the event bus** (every meaningful change passes through `publish`):

- Add kernel security primitives `CallContext` (actor + organization +
  permissions) and `Authorizer` (a policy decision point) in
  `packages/canonical-kernel/src/security.ts`.
- `EventBus` gains `requireActor` (rejects unattributed events —
  `event.actor.required`) and an `authorizer` (rejects policy-denied or
  cross-tenant writes — `event.authorization.denied`).
- A tenant-scoped `Authorizer` rejects cross-organization writes;
  `CallContext.organizationId` is the kernel-level tenant carrier.
- Default is **non-enforcing** (`ALLOW_ALL`, `requireActor = false`) for backward
  compatibility; production composition enables enforcing mode.

## Consequences

- The architectural capability for enforced attribution + authorization +
  tenancy exists at the chokepoint and is covered by
  `testing/security/enforcement.test.ts` (unattributed rejected; policy denial
  rejected; authorized actor recorded on the fact; correlated facts carry the
  acting identity; cross-org write rejected; non-enforcing default unchanged).
- Residual: service write APIs do not yet **require** a `CallContext` by default,
  so automatic attribution is not yet pervasive; read-path repository tenant
  scoping is not yet implemented (enforcement today is write/policy-level). Both
  land with ADR 0004 (same write paths).
- The mechanism is part of the proposed frozen contract; pervasive wiring +
  repository scoping must be green under CI before Architecture Freeze v1.0.
