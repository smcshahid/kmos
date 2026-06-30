# KMOS Core v1 — Draft Spec Rulings, Violations Register & Architecture Freeze Recommendation

**Reviewer:** Chief Certification Engineer (independent)
**Date:** 2026-06-30

---

## Part A — Draft specification rulings (KMOS-0208 / 0209 / 0210)

These three specs were authored by the implementation team to fill gaps the foundational series referenced but did not define. They are evaluated for architectural fit, completeness, and consistency with the Constitution. A conflict of interest is noted: the same agent authored both specs and implementation; rulings below are deliberately skeptical.

### KMOS-0208 — Search & Discovery Service → **ACCEPT WITH REVISIONS**
- **Strengths:** Correctly frames indexes as rebuildable projections (not system of record), event-driven indexing, hybrid keyword+vector with RRF, rebuild-by-replay. Well aligned with KMOS-0130 §18 and KMOS-0110.
- **Required revisions before ratification:**
  1. **Governance-aware filtering must be mandatory, not opt-in.** The implementation defaults to an `AllowAll` access filter; the spec must require an enforcing `AccessFilter` bound to the caller's identity/classification (ties to CRIT-2). As written + built, search can leak across classifications/tenants.
  2. Specify index **consistency/staleness** semantics (eventual; bounded lag) and reindex/alias-swap atomicity guarantees normatively.
  3. Define behavior for **redaction/erasure** (right-to-be-forgotten) of projected content vs. the immutable source.
- **Verdict:** Architecturally sound; ratify after the access-control and consistency clauses are added.

### KMOS-0209 — Configuration Service → **ACCEPT WITH REVISIONS**
- **Strengths:** Versioned immutable config, profile/override precedence, secret *references* (never clear values), governed-change events. Good fit with KMOS-0160 §9 / KMOS-0190.
- **Required revisions:**
  1. Make the **governed-change approval** integration concrete (which changes require Governance approval; how the event ties to an Approval record), rather than "may require approval."
  2. Specify **secret-resolver trust boundary** and audit (who resolved which secret, when) — currently the echo adapter is illustrative only.
  3. Define **config schema validation** at set-time against a registered schema (consistency with the canonical validator).
- **Verdict:** Ratify after the governance and secret-audit clauses are tightened. Also assign it a non-conflicting spec number (0209 is unused in the series; confirm with the spec registrar).

### KMOS-0210 — Capability Runtime → **ACCEPT WITH REVISIONS**
- **Strengths:** Cleanly separates execution (Runtime) from catalog (Registry, KMOS-0205); contract-bound invocation; fault isolation; health; AI-model independence. Fills a real, spec-referenced gap.
- **Required revisions (important):**
  1. **Reconcile sync/async with CRIT-1.** The runtime invoke path is async; the spec must state the execution/IO model normatively and align with the (to-be-async) kernel event-log and bus, so the frozen contracts are internally consistent.
  2. Strengthen **isolation guarantees**: specify resource limits, timeouts, and cancellation (today isolation = a try/catch). For real workers (WASM/process/remote) the spec should define the isolation contract, not just error containment.
  3. Define **idempotency/retry semantics** for capability execution (at-least-once invocation? exactly-once effects?) consistent with the event model.
- **Verdict:** Architecturally necessary and sound in shape; ratify after isolation + execution-model clauses are added.

**Summary:** None warrant rejection; all three are **Accept with revisions.** They are coherent with the architecture and fill genuine gaps. They should be ratified through governance (KMOS-9999 §20) — and 0210 in particular must be revised in lockstep with the CRIT-1 async correction so the frozen contract set is consistent.

---

## Part B — Constitutional violations & intent deviations (consolidated register)

| Ref | Type | Constitutional basis | Status |
|---|---|---|---|
| CRIT-2 | **Violation** | §3 (Identity before Permissions), §15, KMOS-0190, KMOS-0206 | Authn/authz/attribution not enforced; `actorId` never set |
| CRIT-1 | **Deviation from intent** | §12, KMOS-0010 §19 (technology replaceable behind ports) | Kernel event-log port sync; real storage cannot satisfy it |
| HIGH-1 | **Acceptance shortfall** | §22 (done = production-ready), §16 | `tsc`/`eslint`/CI never run; type-safety unverified |
| HIGH-2 | **Violation (data isolation)** | KMOS-0009 multi-tenancy | Tenancy not enforced at repositories |
| HIGH-3 | **Control weakness** | §10/§6 boundary integrity (the guard itself) | Fitness dep-direction near no-op |
| MED-5 | **Deviation from intent** | KMOS-0110/10040 (one canonical catalog) | Event vocabulary fragmented |
| §18 | **Partial** | §18 observability | Observability engine not wired into services |
| MED-2/MED-4/MED-1 | **Quality/claim gaps** | engineering charter (honesty, determinism) | Backoff not implemented; clock leaks; dedup unbounded |

Nothing found rises to the level the Constitution treats as absolutely prohibited (e.g., AI as system of record, business logic in workflow/apps, mutable events) — those invariants are **upheld**. The violations are concentrated in **security enforcement** and **one kernel port contract**.

---

## Part C — Architecture Freeze v1.0 recommendation

### Recommendation: **DO NOT declare Architecture Freeze v1.0 now. Declare a freeze candidate (`v1.0-rc`), remediate the breaking-by-nature items, then freeze.**

**Rationale.** A freeze exists to make the core contracts permanent and expensive to change. Two findings are *exactly* the kind of thing that becomes very expensive after a freeze, because the fix is itself a breaking change to a frozen contract:
- **CRIT-1** — fixing the event-log port = changing the kernel (the most-frozen artifact) and every consumer.
- **CRIT-2** — enforcing identity/authz = changing write-API signatures across all services.

Freezing before these are corrected would either (a) ossify a kernel that cannot back real storage, or (b) force a "breaking change to a frozen baseline" within weeks — defeating the purpose of the freeze. The Constitution itself (§20, §22) argues against freezing on unverified, contract-incomplete foundations.

The good news: the **conceptual architecture is freeze-worthy** and should not be reopened. The required work is contract hardening, not redesign (~5–8 engineer-days for the gating set; doc 03).

### Freeze gate — conditions to satisfy before declaring v1.0 (must-haves)
1. **CRIT-1:** Kernel `EventLog` (and bus/replay/service read paths) made async; one real Postgres adapter wired and the EventLog contract test green against it.
2. **CRIT-2:** `CallContext` (actor + organization + authorization) threaded through write APIs; services enforce authz and stamp `actorId`/`organizationId`; boundary authz + tenancy tests added.
3. **HIGH-1:** `npm ci && npm run typecheck && npm run lint && npm test` green on a real runner / CI (close the verification gap).
4. **HIGH-3:** Fitness dependency-direction generalized to all `@kmos/*` layers (so the freeze is guarded by a working guard).
5. **MED-5:** Canonical event catalog consolidated into the kernel (it is part of the frozen surface).
6. **Specs 0208/0209/0210** ratified through governance with the Part A revisions.

### Recommended (strongly) but not strictly gating
- HIGH-2 tenancy enforcement (can be same change as CRIT-2), MED-1/2/4 fixes, MED-3 dist cleanup, observability wiring (§18).

### What may remain deferred past freeze (legitimately)
Encryption-at-rest, real OIDC IdP, mTLS/SPIFFE, Vault, signed events/WORM, container/Helm artifacts, load/soak testing, the extension marketplace, federation. These are deployment/operational hardening that do **not** change the frozen core contracts and are appropriately post-freeze.

### Bottom line
KMOS Core v1 is a **strong, faithful reference implementation** and a sound basis for the permanent baseline. It is **provisionally accepted but not yet certifiable as Architecture Freeze v1.0.** Grant `v1.0-rc`, complete the six freeze-gate items (a short, well-scoped cycle, no redesign), re-review, and then declare Architecture Freeze v1.0 with confidence.

---

### Independence note
This review was produced by the same agent that implemented KMOS Core v1, explicitly instructed to act as an independent board. I have surfaced defects in my own prior work (notably CRIT-1, CRIT-2, HIGH-1, HIGH-3) that the implementation-phase certification report understated or framed as mere "deferrals." A truly independent human review board is still recommended to ratify these findings before the freeze decision is finalized — particularly the CRIT-2 security determination, where author bias is most consequential.
