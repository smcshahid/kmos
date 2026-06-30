# KMOS Migration Guide

How to evolve KMOS safely. Two parts:

1. **Event-schema / canonical-object evolution** — the routine, backward-compatible
   way to extend the platform's vocabulary and payloads.
2. **The KEP-001 async EventLog kernel migration** — the one breaking migration
   planned before Architecture Freeze v1.0.

---

## Part A — Event-schema & canonical-object evolution

KMOS keeps **institutional knowledge permanent** while representations evolve.
The event log is immutable and append-only; any change to the vocabulary or to
event payloads must keep **historical events replayable**. The governing rule is
backward compatibility.

### A.1 The BACKWARD-compatibility rule

The Event Service schema registry enforces **BACKWARD** compatibility by default
(`platform/events/src/domain/schema-registry.ts`,
`engineering/DECISIONS.md` / Readiness Report §7.1). A new schema version for an
existing event type is accepted only if every payload valid under the previous
version is still valid under the new one. Concretely, a change is rejected if it:

- **adds a new required field**, or
- **changes the declared type** of an existing field.

Additive changes that keep old data valid (e.g. adding an **optional** field) are
accepted. This guarantees that events written under the old schema continue to
validate and replay after the schema evolves.

### A.2 Adding a new event type to the kernel catalog

Canonical event **types** live in a single source of truth: the kernel catalog
seed `packages/canonical-kernel/src/schema/event-catalog.ts` (97 types;
consolidated under remediation MED-5). Only catalogued types may be published
through the bus — publishing an unknown type raises
`Unregistered canonical event type: ...`.

To add a type, append a `def(...)` entry to the seed:
```ts
def('OrganizationCreated', 'IdentityService', 'Institutional', 'Identity'),
//   type                  owner             eventClass      category  (schemaVersion defaults to '1.0')
```
Do **not** add the type to a per-service local catalog; that reintroduces the
drift MED-5 eliminated. (See `engineering/KNOWN_ISSUES.md` M1-01/M1-02 for the
candidate types this pattern was created for.)

### A.3 Additive schema changes (payload contracts)

Event **payload** contracts are versioned in the Event Service schema registry,
independently of the catalog's envelope `schemaVersion`. Register a new version
with `EventService.registerEventSchema(...)`; the registry runs the BACKWARD
check above before accepting it:
```ts
events.registerEventSchema({
  eventType: 'AssetRegistered',
  version: '1.1',
  schema: { type: 'object', required: ['assetId'],
            properties: { assetId: { type: 'string', format: 'canonical-id' },
                          mediaType: { type: 'string' } } }, // NEW optional field
  // compatibility defaults to 'BACKWARD'
});
```
Adding the optional `mediaType` is accepted; promoting it to `required` would be
rejected as breaking.

### A.4 Replay compatibility (the regression test)

The contract above is locked by `testing/resilience/event-migration.test.ts`,
which proves end to end that:

1. v1.0 events publish and validate;
2. a BACKWARD-compatible v1.1 (adds an **optional** field) is **accepted**;
3. an incompatible change (adds a **required** field) is **rejected**;
4. **old v1.0 events still validate and still replay** after the schema evolved.

Run it directly:
```bash
node --experimental-strip-types --import ./tools/dev/register.mjs --test testing/resilience/event-migration.test.ts
```
Any schema-evolution work must keep this test green. The persisted event format,
sequence semantics, and correlation/causation are never changed by an additive
migration, so no data migration is required.

---

## Part B — KEP-001: the async EventLog kernel migration

This is the **one breaking migration** scheduled before Architecture Freeze
v1.0. It is a kernel migration (it touches `@kmos/canonical-kernel`, the most
frozen artifact) and is **planned, not yet executed** — staged for a networked,
type-checked CI environment.

**Authoritative procedure:** `engineering/review/07-KERNEL-EVOLUTION-PLAN.md`.
That document is the source of truth for design, staging, CI requirements,
rollback, and acceptance criteria. This section summarizes only the
consumer-facing impact.

### B.1 Why it is needed

The kernel `EventLog` port is currently **synchronous**. Real storage
(PostgreSQL, brokers) is asynchronous, so the Postgres adapter today implements a
*separate* `AsyncEventLog` interface — meaning the authoritative kernel port is
not directly database-satisfiable (issue CRIT-1). KEP-001 converts the single
kernel `EventLog` port to async so both `InMemoryEventLog` and `PostgresEventLog`
implement the *same* port.

### B.2 Consumer-facing impact

The platform adopts an **await-everywhere publication contract**:

- The `EventLog` port becomes asynchronous (`append`, `read`, `readStream`,
  `currentVersion`, `size` all return `Promise<...>`); `replay()` becomes async.
- Every service **read** method that touches the log/replay becomes `async`.
- Every service **write** method that emits a canonical event becomes `async` and
  **must `await`** its emission.
- **Fire-and-forget emits are prohibited.** `void this.emit(...)` /
  `void this.publish(...)` in `platform/**` and `domains/**` write paths are
  banned and will be caught by a new fitness rule.
- Domains and applications that call now-async service methods must `await` them
  and become `async` as needed.
- `EventBus.publish` resolves **only after** the event is durably appended **and**
  all in-process subscribers have been delivered or dead-lettered. This makes
  in-process timing identical to real async storage — event-capture assertions
  become deterministic after the awaited write (no flush hacks).

### B.3 What does NOT change

- The **persisted event format / schema is unchanged → no data migration.** Old
  event logs replay unchanged.
- Canonical objects, the 97-type event catalog, and governance/identity/knowledge
  semantics are unchanged.
- Validation, idempotency dedup, dead-lettering, replay-from-log, disaster
  recovery, and the CRIT-2 enforcement hooks are behaviorally unchanged — only
  `await`ed.

### B.4 For out-of-tree (SDK) consumers

In-repo consumers are migrated atomically (monorepo, single branch). External
consumers get: a deprecated `AsyncEventLog = EventLog` type alias for one RC; a
one-page "add `await`" note; and a codemod
(`tools/migrate/kep-001-add-awaits.mjs`) that inserts `await` at known call sites
and flags ambiguous ones. The kernel line bumps to a `1.0.0-rc.x` (SemVer-major
intent).

### B.5 Status and sequencing

- **Status:** Accepted **plan**, pending CI execution. It is intentionally taken
  **pre-freeze**, because after Architecture Freeze v1.0 a kernel change would
  require the full constitutional migration review (KMOS-9999 §20).
- It is co-executed with the CRIT-2/HIGH-2 pervasive `CallContext` wiring and the
  HIGH-1 CI gate, because all three touch the same write paths.
- The migration lands as **one atomic, `tsc`-guarded merge** — never a
  half-async `main`. Rollback is a single `git revert` with zero data risk.

Once KEP-001 is green in CI (including a real Postgres run), CRIT-1 is closed and
KMOS Core becomes eligible for Architecture Freeze v1.0. See
`engineering/review/07-KERNEL-EVOLUTION-PLAN.md` §10 for the full
definition-of-done.
