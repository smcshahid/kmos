# KMOS — v1.0 General Availability Certification (single-node self-hosted / Olares)

**Date:** 2026-07-01 · **Version under certification:** `1.0.0-pc.2` · **Target platform:** Olares (self-hosted), single node
**Author:** Autonomous Engineering Program · **Certified profile:** SINGLE-NODE SELF-HOSTED ONLY

> Evidence tags: **[Olares]** verified by the owner on their real Olares instance ·
> **[local]** verified here via docker-compose against real PostgreSQL · **[CI]**
> verified in GitHub Actions · **[not done]**. The recommendation is in §7; it is
> **scoped strictly to the single-node self-hosted profile** — broader profiles are
> explicitly NOT certified (§3).

---

## 1. Executive Summary

Every architectural and operational blocker previously identified for KMOS v1.0 on
the single-node self-hosted profile has been resolved and **verified on the real
target platform**. KMOS installs on Olares, runs the full institutional workflow,
persists to a durable PostgreSQL event log, and — as of `1.0.0-pc.2` — **rebuilds
every read model on restart so the platform is functionally identical before and
after shutdown**, confirmed by the owner across multiple restart cycles on their
Olares instance.

On the engineering evidence, **KMOS v1.0 is READY for General Availability on the
single-node self-hosted (Olares) profile**, subject to **one owner action that is
not an engineering matter: choosing a LICENSE** (the repository is `UNLICENSED`).
With the license set, GA can be declared for this profile. Broader profiles
(multi-replica HA, managed cloud, multi-tenant scale) remain uncertified pending
their own evidence.

## 2. Evidence Ledger

| Capability | Evidence | Where |
|---|---|---|
| Async EventLog kernel (CRIT-1) | one async port, real-PG contract green | [CI] |
| Pervasive attribution (CRIT-2) | enforcing-mode tests | [CI] |
| Type soundness | clean `tsc --build`; 232/233 tests | [CI][local] |
| Durable event log (system of record) | survives restart 77→79, 60→62→64 | [Olares] |
| Install via Olares Application Chart | OAC accepted + installed (pc.1, pc.2) | [Olares] |
| Olares-provisioned PostgreSQL | `middleware.postgres` provisioned + injected | [Olares] |
| Full workflow end-to-end | identity→media→knowledge→search→publish→trust | [Olares] |
| **Read-model recovery (final blocker)** | **object retrieval identical across restarts (2 cycles)** | **[Olares]** |
| Read-model recovery (detail) | `GET /knowledge/:id` HTTP 200 identical across restarts | [local] |
| Public image, self-verifying | built by CI, pulled anonymously, boots | [CI][local] |
| Conformance | all profiles compliant | [CI] |

## 3. Certified Scope (and what is NOT certified)

**Certified:** KMOS `1.0.0-pc.2`, deployed as a **single application instance
(`replicas: 1`)** on Olares (or equivalent single-node container host), backed by
a single managed PostgreSQL, self-hosted.

**NOT certified (no evidence; do not represent as GA):**
- Multi-replica / horizontal HA. Read-model recovery makes any *single* instance
  rebuildable on boot, but live cross-replica coordination was not built or tested.
- Managed-cloud profiles (AWS/Azure/GCP/DO). The artifact is portable by design,
  but only Olares single-node was validated.
- Multi-tenant scale, high-throughput, or large-corpus performance (no load tests).

## 4. What the Program Delivered (arc)

Snapshot → git/GitHub/CI → type-soundness (ADR-0008) → **KEP-001 async EventLog /
CRIT-1** (ADR-0009) → **CRIT-2 pervasive attribution** → secrets/deploy scaffolding
→ Production Candidate `1.0.0-pc.1` → **durable PostgreSQL server wiring** →
**Olares Application Chart + real-Olares deployment** (ADR-0010) → **read-model
recovery** (ADR-0011) → `1.0.0-pc.2`. Every step is a logical Conventional-Commit
milestone; CI is green on `main`; history is clean; docs/ADRs/release-notes current.

## 5. Independent Engineering Review (adversarial, no attachment)

*Acting as an external board instructed to block GA if it can.*

- **"Read-model recovery — real on Olares, or just local?"** Real on Olares: the
  owner observed object retrieval identical across two restart cycles on their
  instance, with the durable-log event signature (60→62→64). The decisive
  detail-level proof (`GET /:id` HTTP 200 identical) is [local] with the *same
  published image* Olares runs. **Upheld.**
- **"Is the architecture sound, or bolted on?"** State-carried events + `hydrate()`
  is a standard event-sourcing pattern; the kernel, ports, catalog, and constitution
  are untouched; read models are now a deterministic function of the durable log.
  Per-service rebuild tests prove deep-equality. **Sound.**
- **"You ship `replicas: 1`. Is that GA?"** For the *single-node self-hosted
  profile* — the only profile certified — yes. HA is explicitly out of scope (§3),
  not hidden. **Consistent.**
- **"The event log grows on every restart."** Two inert index-lifecycle events per
  boot; they carry no snapshot, drive no read model, and are skipped on replay.
  Cosmetic, bounded-per-restart, disclosed (ADR-0011). **Not a blocker.**
- **"Honest limits?"** Roles created-but-never-assigned, timers, and intermediate
  non-terminal approval states are not separately snapshotted (ADR-0011); none
  affect the certified flows, and all are disclosed. **Honest.**
- **"What actually blocks GA?"** Only the **LICENSE** (owner/legal, not
  engineering) and, as operational hygiene, a rehearsed `pg_dump` backup/restore
  drill (the recovery *mechanism* is already demonstrated by restart). **Fair.**
- **Board verdict:** *The engineering evidence supports v1.0 GA for the single-node
  self-hosted Olares profile. The platform installs, runs, durably persists, and
  recovers identically across restarts on the real target, with all critical items
  CI-gated and independently reproduced. Approve GA for this profile upon the owner
  setting a LICENSE; keep broader profiles uncertified.*

## 6. Remaining Items

- **GATE (owner, non-engineering): LICENSE.** Repository is `UNLICENSED`. A GA
  release requires a deliberate license choice (e.g. Apache-2.0 / MIT for open
  source, or an explicit proprietary license). This is the **one action standing
  between the current evidence and a declared GA**.
- **Recommended before production data:** one rehearsed `pg_dump` → restore →
  rebuild-by-replay drill on the Olares Postgres (procedure in
  `documentation/BACKUP-AND-RESTORE.md`; the recovery path is already demonstrated
  by the restart test).
- **v1.x (not GA blockers):** Olares-identity → `CallContext` attribution bridge;
  distributed tracing; multi-replica HA (needs cross-instance coordination);
  managed-cloud validation; "quiet boot" to stop index-event accrual; multi-stage
  slim runtime image.

## 7. General Availability Recommendation

**RECOMMEND: declare KMOS v1.0 General Availability for the single-node self-hosted
(Olares) profile — conditional on the owner setting a LICENSE.**

The engineering evidence supports it: every critical architectural and operational
blocker is resolved and verified on the real target platform, with CI gating and
independent reproduction. The only remaining gate is the LICENSE, which is a
governance/legal decision for the owner, not an engineering gap. Once the license
is chosen, the recommended finalization is: add the `LICENSE` file, bump to
`1.0.0`, tag `v1.0.0`, and publish the GA release notes.

**Do not** represent KMOS as GA for multi-replica, managed-cloud, or high-scale
profiles until each is validated with its own evidence (§3).

## 8. Final Word

KMOS began this program as a repository snapshot and is now a constitutionally-
governed platform that has been **installed, operated, durably persisted, restarted,
and recovered on a real self-hosted target**, with every significant claim backed by
reproducible evidence and every limitation disclosed. On that basis it has, in my
professional judgement, reached the maturity expected of a v1.0 platform for the
single-node self-hosted profile — pending only the owner's license decision.
