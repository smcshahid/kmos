# KMOS Versioning & Compatibility Policy

**Audience:** engineers and consumers who depend on KMOS packages, events, and the
canonical kernel.
**Scope:** the SemVer policy for the monorepo and per package, the canonical
kernel's special post-freeze status, event-schema compatibility, and the
deprecation policy.
**Authority:** governed by the constitution (KMOS-9999) and the ADRs in
`documentation/adr/`; where a spec disagrees, the spec wins.

> **Status (2026-06-30):** KMOS `1.0.0-rc.1`. Architecture Freeze v1.0 is
> **eligible on the kernel axis** but **not yet declared** (a human-board act).
> Rules below that depend on the freeze are marked **(post-freeze / roadmap)**.

---

## 1. Semantic Versioning

KMOS follows **[Semantic Versioning 2.0.0](https://semver.org/)**: `MAJOR.MINOR.PATCH`.

- **MAJOR** — a breaking change to a published contract (a canonical type, a port
  interface, an event's meaning, a public package API).
- **MINOR** — backward-compatible additions (new events, new optional fields, new
  ports, new capabilities).
- **PATCH** — backward-compatible fixes with no contract change.

### 1.1 Monorepo version vs. per-package version

- **Monorepo (release) version** — the whole platform advances together through a
  single release identifier. At the certified baseline **all workspace manifests
  are aligned to one identifier** (`1.0.0-rc.1`); this alignment is a deliberate
  release-management precondition (see `engineering/review/13-PRODUCTION-FOUNDATION-CLOSEOUT.md`
  §9) and is verified by the repository audit.
- **Per-package version** — each `@kmos/*` workspace package carries its own
  `package.json` version and its own contract obligations. A consumer that depends
  on `@kmos/knowledge` reasons about *that* package's SemVer, while the release
  identifier tells them which coherent platform snapshot it belongs to.

Until GA the two are kept in lockstep at the same pre-release identifier to avoid
metadata drift; independent per-package version divergence is a **post-GA
roadmap** capability, not a current guarantee.

---

## 2. Pre-release identifiers

KMOS uses the SemVer pre-release channel to express release stage. The intended
progression for the 1.0.0 line is:

```
1.0.0-rc.1   →   1.0.0-pc.1   →   1.0.0
```

- **`-rc` (Release Candidate)** — the current identifier. The platform core is
  complete and green at **library grade**; substrate work remains.
- **`-pc` (Production Candidate)** — **roadmap**. Reached when the Production
  Substrate work lands with CI evidence (read-model persistence, pervasive
  identity enforcement, real auth/secrets validated in a real environment). The
  General Availability Assessment classifies the platform today as
  *Production-Candidate-in-progress* — the keystone (CRIT-1) is done, the
  remaining items are well-scoped (`engineering/review/15` §5).
- **`1.0.0`** — GA. Declared by the human review board after the Production
  Candidate gate closes with the same evidence discipline. GA is **not
  self-issuable**.

These map to the stages in `RELEASE-LIFECYCLE.md`; the identifier is the
externally visible signal of the stage.

---

## 3. The canonical kernel's special status

`packages/canonical-kernel` is the single source of truth (ADR-0002) and the
**most-frozen artifact** in the platform. Its version obligations are stricter
than any other package.

- **Before Architecture Freeze v1.0.** Breaking kernel changes are permitted as
  ordinary reviewed refactors — but only through the governed
  **kernel-evolution process** (KMOS-9999 §20/§28), executed as a **KEP**
  (Kernel Evolution Plan). The canonical model is **KEP-001 / ADR-0009**: the
  synchronous→asynchronous `EventLog` port migration, landed atomically under a
  green `tsc` + tests + a **real-PostgreSQL contract run in CI**. That change was
  taken **pre-freeze on purpose** — the only moment a breaking kernel-port change
  is an internal refactor rather than a constitutional migration (ADR-0009).
- **After Architecture Freeze v1.0 (post-freeze / roadmap).** Once the board
  declares the freeze, the conceptual kernel architecture is **not reopened**. Any
  change to a frozen kernel contract requires the **KMOS-9999 §20 migration
  process** — a full constitutional migration (new KEP, board ratification,
  compatibility plan, replay-safety proof), not a refactor. ADR-0009 is the
  template for how such a migration is planned, gated, and evidenced.

The lesson recorded in ADR-0009 is load-bearing for versioning: **CI's clean
`npm ci` build is authoritative**; local incremental builds can hide
cross-package drift and must not be trusted for a version/compatibility sign-off.

---

## 4. Event-schema compatibility

Events are the durable institutional vocabulary and carry the strongest
compatibility guarantee.

- **BACKWARD compatibility, additive-only.** The Event Service (KMOS-0203)
  maintains a **schema registry** and enforces **BACKWARD** compatibility. Schema
  evolution is **additive only**: you may add new optional fields or new event
  types; you may **not** remove or repurpose an existing field, rename an event,
  or change an event's meaning within a version.
- **Single authoritative catalog.** All canonical event **types** live in the
  kernel event catalog (ADR-0002; consolidated per MED-5). Only catalogued types
  may be published; the bus rejects unregistered types and version mismatches
  before anything reaches the log. Adding a new event type is a single edit to the
  kernel catalog seed, reviewed as a kernel change.
- **Replay safety is the invariant.** Because the log is the system of record and
  read models are rebuilt by replay, **old logs must replay unchanged**. ADR-0009
  preserved this explicitly: the persisted event format, correlation/causation,
  idempotency, and dead-lettering were unchanged, so no data migration was needed.
  Any future event-schema change must uphold the same property.

---

## 5. Deprecation policy

- **Deprecation is announced, then removed on a MAJOR/MINOR boundary.** A symbol
  is marked deprecated (a documented alias or `@deprecated`) for at least one
  release channel before removal, so consumers have a migration window.
- **Concrete example on record — the `AsyncEventLog` alias.** When KEP-001 unified
  the in-memory and Postgres adapters onto one async kernel `EventLog`, the
  separate `AsyncEventLog` interface was deleted but a **deprecated
  `type AsyncEventLog = EventLog` alias is kept for one RC** and is scheduled for
  **removal at v1.1** (ADR-0009 §Consequences; `engineering/review/15` §3, §15).
  This is the reference pattern: keep a thin compatibility alias for one channel,
  document the removal version, then remove it.

Removals are recorded in the ADRs and, going forward, in a CHANGELOG (a CHANGELOG
is a **roadmap** item — `engineering/review/15` §9 notes it is not yet authored).

---

## 6. What a consumer can rely on today

| Guarantee | Status |
|---|---|
| One coherent release identifier across all packages | **Verified** (all manifests at `1.0.0-rc.1`) |
| Async `EventLog` kernel port, real-PG-validated | **Verified** (ADR-0009, CI database job) |
| Additive-only, BACKWARD event-schema evolution; old logs replay unchanged | **Verified as policy**, enforced by catalog + registry |
| Kernel changes gated by the governed KEP / §20 process | **In force** |
| Independent per-package version divergence | **Roadmap** (post-GA) |
| CHANGELOG, published/signed releases | **Roadmap** |
| Post-freeze §20 constitutional-migration flow | **Roadmap** — activates when Architecture Freeze v1.0 is declared |

See `RELEASE-LIFECYCLE.md` for stage gates and `GOVERNANCE-MODEL.md` for how
kernel change control is decided and recorded.
