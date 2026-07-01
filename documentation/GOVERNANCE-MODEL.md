# KMOS Governance Model

**Audience:** everyone who changes KMOS — engineers, reviewers, the review board.
**Scope:** how decisions are made and recorded, the supremacy of the constitution,
the rules that protect the canonical core, automated governance via fitness gates,
the review-board process, and change control for the kernel.
**Authority:** the constitution (KMOS-9999, KMOS-10005) is supreme; this document
describes the governance machinery that upholds it.

> **Status (2026-06-30):** KMOS `1.0.0-rc.1`. The automated governance (fitness
> gates, CI) is **built and enforced**. Some human-process artifacts (branch
> protection config, CODEOWNERS) are **roadmap** and marked as such.

---

## 1. The hierarchy of authority

Governance in KMOS is layered, and higher layers override lower ones:

1. **The constitution (supreme law).** `constitution/` — KMOS-9999
   (Implementation Constitution) and KMOS-10005 (Product Vision & Engineering
   Charter), plus the numbered specifications. Where anything disagrees with the
   specs, **the specs win**. The `constitution/CODING-CONSTITUTION.md` distills
   the development standards derived from them.
2. **Architecture Decision Records (ADRs).** `documentation/adr/` is the
   **canonical ADR home** (Coding Constitution §4; `architecture/` holds derived
   diagrams only). ADRs are the stable, citable architectural record.
3. **The decisions log.** `engineering/DECISIONS.md` is the **living source of
   truth** for engineering decisions (D-A..D-F, KEP-001, …); ADRs are distilled
   from it (`documentation/adr/README.md`).

Nothing overrides the constitution. An engineering decision that would contradict
it is out of order until the constitution itself is amended through governance.

---

## 2. How decisions are made and recorded

- **Every significant engineering decision is recorded** in
  `engineering/DECISIONS.md` and, when architectural, promoted to an ADR in
  `documentation/adr/` in standard format (Context / Decision / Status /
  Consequences). The constitutional requirement (Coding Constitution §9): *future
  engineers must be able to learn the architecture from the repository itself*
  (KMOS-10020).
- **ADR status legend** (`documentation/adr/README.md`): **Accepted** (in force),
  **Accepted-plan** (accepted, execution pending — e.g. gated on CI),
  **Proposed** (recommended default, awaiting confirmation), **Superseded**
  (replaced by a later ADR). Example: ADR-0004 proposed the async EventLog
  migration and was **superseded** by ADR-0009 which implemented it.
- **A reverse dependency requires a logged ADR** (Coding Constitution §4). Nothing
  that bends the layering is admissible without a recorded, reviewed decision.

The ADR index today runs **0001–0009**, covering the modular monolith, the
canonical kernel, ports-and-adapters, the async EventLog migration, enforced
attribution, the HTTP server + UI, the Conformance Kit, canonical generic
type-soundness, and the KEP-001 kernel migration.

---

## 3. Canonical types are sacred

The single most important governance rule protects the source of truth
(Coding Constitution §3; ADR-0002):

> Import all canonical objects, the event envelope, schemas, and the event catalog
> from `@kmos/canonical-kernel`. **Never redefine a canonical object or invent an
> event name.** New canonical types/events are added to the kernel via review,
> never ad hoc.

This closes the object/event-drift risk (R-02). Adding a canonical event type is a
single reviewed edit to the kernel catalog seed; per-service local catalogs are
prohibited, and the bus rejects any uncatalogued type before it reaches the log.
Because the kernel is the most-frozen artifact, changes to it carry the strictest
change control (§6).

---

## 4. Fitness gates — governance as code

KMOS enforces its architecture **automatically**, not by reviewer vigilance alone.
`tools/fitness-checks/run.mjs` is executable governance: it discovers each
package's owning layer from its `package.json` name and rejects any violation.
Four structural invariants are enforced, plus the await-everywhere rule:

1. **Dependency direction** — every `@kmos/*` import must point **down** the stack
   (applications → domains/connectors → capabilities → engines/platform →
   packages), for all layers, not just the kernel.
2. **No cross-service imports** — a platform service may not import another
   platform service's internals; cross-service contact is **canonical events +
   business APIs** only.
3. **Kernel purity** — `packages/canonical-kernel` imports no infrastructure
   (`pg`, `kafkajs`, `nats`, …) and nothing from an upper layer.
4. **Ports-and-adapters** — infrastructure modules may only be imported inside an
   `infrastructure/` directory.
5. **Await-everywhere / no fire-and-forget** — every event-emitting write path is
   `async` and **must `await` publication**; `void this.emit(...)` is prohibited
   (the sole exception is a constructor, which must carry an explicit
   `fitness-allow-fire-and-forget` justification). This is KEP-D1 from ADR-0009.

At the certified baseline the checker reports **0 violations**. Fitness is part of
the CI **static** job and of `npm run verify`, so a violation cannot merge. This
is the mechanism that makes the constitutional architecture self-defending as the
platform evolves across products and teams — and the Conformance Kit
(`@kmos/conformance`, ADR-0007) extends the same idea to the ports, turning them
into published, versioned contracts any implementation must satisfy.

---

## 5. The review-board process

KMOS distinguishes **automated gates** (which every change passes) from
**board-ratified milestones** (which only a human board may declare).

- **Automated, per-change.** CI runs three jobs — **static** (lint + fitness +
  typecheck), **tests**, and **database** (EventLog contract against real
  PostgreSQL) — green on PRs and `main`. This is necessary but not sufficient for
  a milestone.
- **Human board, per-milestone.** **Architecture Freeze v1.0** and **General
  Availability** are **human-board acts** and **cannot be self-issued**
  (`engineering/review/15` §6, §20). The board weighs the CI evidence plus the
  honest gap ledger and ratifies (or withholds) the stage. Independence matters:
  because the same autonomous program both built and assessed the platform, a
  human ratification gate is required before GA.
- **Adversarial review is part of the method.** The board review is conducted
  *instructed to find reasons not to ship* (`engineering/review/15` §19), and the
  program's own reports correct overclaims (e.g. "persistence is done" is
  explicitly downgraded — only the EventLog is real-PG-validated). This
  no-attachment posture is a governance feature, not an afterthought.

The engineering review series (`engineering/review/00`–`15`) is the durable record
of these board reviews and close-outs.

---

## 6. Change control for the kernel

The canonical kernel has the strictest change control in the platform:

- **Before Architecture Freeze v1.0.** A breaking kernel change is admissible only
  through the governed **Kernel Evolution Plan (KEP)** process (KMOS-9999
  §20/§28): a written plan, atomic landing under green `tsc` + tests, and — for a
  storage-facing change — a **real-PostgreSQL contract run in CI**. The canonical
  worked example is **KEP-001 / ADR-0009**: the sync→async `EventLog` migration,
  landed as one reviewed unit, proven against real Postgres, with the persisted
  format and replay semantics unchanged. It was taken **pre-freeze on purpose** —
  the only window in which such a change is an internal refactor rather than a
  constitutional migration.
- **After Architecture Freeze v1.0 (roadmap).** Once the board declares the
  freeze, the conceptual kernel architecture is **not reopened**. Any change to a
  frozen kernel contract requires the full **KMOS-9999 §20 migration process** —
  a new KEP, a compatibility and replay-safety plan, and board ratification — not
  a refactor. ADR-0009 is the template for how that migration is planned, gated,
  and evidenced.
- **The authoritative build signal.** For any kernel sign-off, **CI's clean
  `npm ci` build is authoritative**; local incremental builds can hide
  cross-package drift (the concrete lesson of KEP-001, where a stale build masked
  six real defects — ADR-0009 §Consequences).

---

## 7. Summary

Decisions are recorded (DECISIONS.md + ADRs) under a constitution that is supreme
law; canonical types are sacred and change only through review; the architecture
defends itself through automated fitness gates and the Conformance Kit; and the
two governance thresholds — Architecture Freeze and GA — require human-board
ratification on top of green CI evidence, with the kernel held to the strictest
change control of all. See `RELEASE-LIFECYCLE.md` for the stage gates and
`VERSIONING-AND-COMPATIBILITY.md` for how kernel change control interacts with
versioning.
