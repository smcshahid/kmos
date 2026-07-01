# KMOS Release Lifecycle

**Audience:** owners, the review board, and engineers driving KMOS toward GA.
**Scope:** the release stages this project actually uses, each stage's exit gate,
the role of CI evidence and human ratification, and how tags/branches map to
stages.
**Authority:** governed by the constitution (KMOS-9999 §20/§22/§28) and evidenced
by the engineering review series (`engineering/review/00`–`15`).

> **Status (2026-06-30):** KMOS `1.0.0-rc.1`. The platform has passed through
> Reference Implementation, Platform Hardening, and Production Foundation, has
> landed the keystone kernel migration (KEP-001), and is **Architecture-Freeze-
> eligible on the kernel axis**. It is **not yet GA**. Stages ahead of the current
> position are marked **(roadmap)**.

---

## 1. The stages

KMOS advances through named stages. Each stage is a real checkpoint in the review
series, not a marketing label; each has an **exit gate** that must be met — with
**evidence** — before the next stage begins.

| # | Stage | What it establishes | Evidence artifact |
|---|---|---|---|
| 1 | **Reference Implementation** | The full constitutional architecture realized at library grade: seven engines + Configuration + Search, capabilities → domains → thin apps, one canonical event bus + append-only log + replay, running end-to-end. | `documentation/ARCHITECTURE.md`; certification `engineering/review/00`–`06` |
| 2 | **Platform Hardening** | Runnable HTTP API server + reference UI; operability (`/health`, `/metrics`, OpenAPI); ecosystem docs. | `engineering/review/10-PLATFORM-HARDENING-CLOSEOUT.md`; ADR-0006 |
| 3 | **Production Foundation** | Ecosystem-integrity + release governance: the Conformance Kit, version alignment, repository/source-control audits. | `engineering/review/13-PRODUCTION-FOUNDATION-CLOSEOUT.md`; ADR-0007 |
| 4 | **Architecture Freeze v1.0** | The conceptual kernel architecture is declared stable and not reopened. Prerequisite: KEP-001 (async EventLog) landed with real-DB proof. | ADR-0009 / KEP-001; `engineering/review/15` §3 |
| 5 | **Production Substrate** *(roadmap)* | The scaffolded ports get real backends: read-model PostgreSQL persistence per service, pervasive identity enforcement, real auth/secrets, deployment + tracing validated on real infra. | Scoped in `engineering/review/15` §17.1–4 |
| 6 | **Production Candidate** *(roadmap)* | All GA blockers closed with CI evidence; the substrate proven, not scaffolded. Identifier `1.0.0-pc.1`. | `engineering/review/15` §5 |
| 7 | **General Availability** *(roadmap)* | GA `1.0.0`, ratified by the human board. | Board ratification (not self-issued) |

Current position: **stage 4 eligible, not declared.** The single largest
architectural risk (CRIT-1, the sync/async kernel port) has been retired with
real-database proof (ADR-0009); the remaining gaps to GA are real and bounded
(`engineering/review/15` §6, §20).

---

## 2. Exit gates

Each transition is gated. A stage does not advance on assertion — it advances on
**verifiable evidence**.

- **Reference Implementation → Platform Hardening.** Full lifecycle demo green
  (`npm run demo`, 0 dead letters); milestones certified; fitness clean.
- **Platform Hardening → Production Foundation.** Runnable server + UI; live HTTP
  suite green; observability endpoints present.
- **Production Foundation → Architecture Freeze.** Conformance Kit all-profiles
  compliant; versions aligned; **and** the freeze prerequisite: **KEP-001 landed
  atomically under green `tsc` + tests + a real-PostgreSQL contract run in CI**
  (ADR-0009). This gate is now met on the kernel axis.
- **Architecture Freeze → Production Substrate → Production Candidate (roadmap).**
  The GA blockers close individually with CI evidence: pervasive `CallContext`
  enforcement (CRIT-2), read-model persistence on real PostgreSQL (DR/replay
  drilled on a real DB), real OIDC authn/authz + a real secrets backend, and
  deployment + tracing validated on a real cluster (`engineering/review/15`
  §6 items 1–6, §17).
- **Production Candidate → GA (roadmap).** All §6 blockers closed; the owner
  **LICENSE** decision made; **human board ratification** obtained.

**No fabricated gates.** Items that cannot be honestly verified in this
environment (real IdP, real cluster, real tracing backend) are **not** certified
as production-validated — they may be scaffolded behind ports and contract-tested
with fakes, but the stage does not advance on a fake. Refusing to fabricate that
certification is itself the correct posture (`engineering/review/15` §6, §19).

---

## 3. CI evidence and human ratification — the two required signals

KMOS treats a release stage as requiring **both** an automated and a human signal.

- **CI evidence (necessary).** CI runs **three jobs**: **static**
  (lint + fitness + typecheck), **tests**, and **database** (the EventLog contract
  against **real PostgreSQL**). All three are green on PRs and on `main`. Locally,
  `npm run verify` = lint + typecheck + fitness + tests. CI's clean `npm ci` build
  is the **authoritative** signal — an explicit lesson from KEP-001, where a stale
  local incremental build masked six real defects that CI would not have
  (ADR-0009; `engineering/review/15` §2).
- **Human board ratification (also necessary at the freeze and at GA).**
  Architecture Freeze and GA are **human-board acts** and **cannot be
  self-issued** (`engineering/review/15` §6, §20). CI proves the code; the board
  ratifies the stage. This is a governance requirement, reinforced because the
  same program that built the platform also assessed it — independence requires a
  human gate before GA.

---

## 4. Tags and branches

The intended mapping of git refs to stages (per the source-control plan,
`engineering/review/12-SOURCE-CONTROL-COMMIT-PLAN.md`):

| Ref | Meaning |
|---|---|
| `main` | The integration branch; every PR runs the three CI jobs; kept green. |
| feature branches → PR → squash-merge | The working flow. KEP-001 landed this way (PR #1, merged as `eb97590`). |
| `v1.0.0-rc.1` tag | The Release Candidate snapshot. |
| `freeze/architecture-v1.0` branch/tag | Marks the declared **Architecture Freeze v1.0** *(roadmap — cut by the board once the freeze is declared)*. |
| `v1.0.0-pc.1` tag | The **Production Candidate** snapshot *(roadmap)*. |
| `v1.0.0` tag | **GA** *(roadmap — cut on board ratification)*. |

Known gaps (honest): branch protection / required-checks config and CODEOWNERS
are **not yet in-repo**, and the local `v1.0.0-rc.1` tag predates the current
green tip (`engineering/review/15` §8). These are repository-hardening roadmap
items, not blockers to the CI evidence itself.

---

## 5. Summary

KMOS reaches a stage only when its exit gate is met with **CI evidence**, and it
crosses the two governance thresholds (Architecture Freeze, GA) only with
**human board ratification** on top of that evidence. Today it sits at
Architecture-Freeze-eligibility with the keystone risk retired; the path to GA is
the Production Substrate and Production Candidate stages, each closed with the same
evidence discipline that has governed the project so far. See
`VERSIONING-AND-COMPATIBILITY.md` for how identifiers track these stages and
`GOVERNANCE-MODEL.md` for how the decisions are made and recorded.
