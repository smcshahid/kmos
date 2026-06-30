# KMOS Core v1 — Production Readiness Assessment

**Reviewer:** Chief Certification Engineer (independent)
**Date:** 2026-06-30
**Question:** Is KMOS Core v1 ready to run in production as a system of record for institutional knowledge?
**Verdict: NOT production-ready.** It is an excellent, well-tested **reference implementation** and a sound architectural baseline candidate, but several production-gating dimensions are unmet by design (in-memory, no enforced security) and by evidence gap (never type-checked/CI-run). This is consistent with the implementation team's own honest deferral notes; this assessment quantifies and ranks them.

Scoring: 🟢 Ready · 🟡 Partial / RC-window · 🔴 Not ready (gating).

---

## 1. Reliability & data durability — 🔴
- All state is **in-memory**; nothing survives process restart. The Postgres EventLog adapter exists but (a) is contract-tested only against an in-memory fake, never a real DB, and (b) implements `AsyncEventLog`, not the kernel port (CRIT-1), so it is not actually wired in.
- Idempotency dedup is in-memory and non-durable (MED-1) → restart can double-process.
- **Gating:** real persistence for every service (events, knowledge, assets, identity, governance, …) behind async ports; durable inbox/outbox; backup/restore. DR-by-replay is proven *in-memory* only.

## 2. Security — 🔴
- **No authentication or authorization is enforced** at service boundaries; actions are unattributed (CRIT-2). This alone disqualifies production use for a governed knowledge system.
- Deferred (per SECURITY-REVIEW.md): encryption-at-rest, real OIDC IdP, mTLS/SPIFFE, Vault secret backend, signed events, WORM retention.
- **Gating:** enforce authn/authz + attribution; integrate a real IdP; encrypt; sign events.

## 3. Correctness & quality evidence — 🟡
- 196 behavioral tests pass; integration + DR + migration + performance + contract suites are real and meaningful.
- **But** `tsc` and `eslint` have never run, and CI has never executed (HIGH-1) → type-safety and lint are unverified; "production-ready, not compiling" (KMOS-9999 §22) is not satisfied because we cannot even confirm it compiles under the type-checker.
- Security/authorization behavior is untested (no boundary enforcement exists to test).
- **Gating:** green `tsc` + `eslint` + CI on a real runner; add authz/tenancy negative tests.

## 4. Observability & operability — 🟡
- `@kmos/observability` (metrics/logging/health) exists and is tested, but **services do not wire it** (KMOS-9999 §18 only partially met); no distributed tracing; no metrics endpoints.
- Operations guide is solid and honest.
- **RC-window:** wire health/metrics/logs/traces into each service; expose endpoints.

## 5. Scalability & performance — 🟡
- Performance "smoke" (5k events) is in-memory and single-process; representative numbers (~120ms publish) say nothing about a networked, persisted deployment.
- The architecture *supports* independent scaling, but nothing has been load-tested against real infra.
- **RC-window/post-freeze:** realistic load + soak tests once persistence/broker are in.

## 6. Deployment — 🔴 (for "production"), 🟢 (for "reference/dev")
- No container images, Helm/k8s manifests, or release pipeline. docker-compose Postgres for dev only. Modular-monolith-first is intentional.
- **Gating for production:** packaging + deploy manifests + rollout/rollback.

## 7. Data governance & lifecycle — 🟢/🟡
- Versioning, lineage, provenance, immutable audit, retention *policy modeling* are strong. Actual retention enforcement / legal hold / WORM are deferred.

## 8. Resilience — 🟡
- Replay-based recovery is proven in-memory and is a genuine strength. Real resilience (broker failover, partial outages, exactly-effectively-once across restarts) is untested because the durable substrate isn't present.

---

## Production-readiness scorecard
| Dimension | Status | Gating for production? |
|---|---|---|
| Reliability / durability | 🔴 | Yes |
| Security (authn/authz/attribution) | 🔴 | Yes |
| Encryption / secrets / IdP | 🔴 | Yes |
| Type-safety / lint / CI evidence | 🟡 | Yes (verification) |
| Correctness (behavioral tests) | 🟢 | — |
| Observability wired into services | 🟡 | RC-window |
| Tracing | 🔴 | RC-window |
| Scalability (load/soak) | 🟡 | Post-persistence |
| Deployment artifacts | 🔴 | Yes |
| Tenancy isolation | 🔴 | Yes |
| Data governance/lineage/audit | 🟢 | — |
| DR by replay | 🟡 (in-memory only) | Re-validate on real storage |

## Overall
**Reference-implementation grade: A−. Production-readiness grade: D (not ready).** The gap is expected and largely pre-acknowledged; the important correction to the team's framing is that some gating items (security enforcement, async event-log port) are **architectural/contractual**, not just "ops deferrals" — they change code that a freeze would lock. They belong in a pre-freeze RC, not a post-freeze backlog.

## Minimum path to a *production pilot* (not full prod)
1. Async kernel event-log port + real Postgres adapters for events/knowledge/assets/identity/governance (CRIT-1).
2. Enforced authn/authz + attribution + tenancy scoping (CRIT-2, HIGH-2).
3. Green `tsc`/`eslint`/CI on a real runner (HIGH-1).
4. Observability wired into services + basic tracing.
5. Container + manifest for the modular monolith; backup/restore runbook.
Estimated: the contract items ~5–8 days (doc 03) + persistence/IdP/packaging are larger, multi-week efforts.
