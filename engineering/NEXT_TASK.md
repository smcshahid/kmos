# KMOS - Next Task

_Last updated: 2026-06-30_

## Status: PRODUCTION CANDIDATE 1.0.0-pc.1 + durable-persistence proven. CRIT-1 + CRIT-2 resolved. Olares = container-validated, package-prepared. NOT yet GA — see engineering/review/17-OLARES-DEPLOYMENT-REPORT.md.

**Olares program (review/17):** the server now persists the canonical event log to real PostgreSQL (KMOS_DATABASE_URL) — VERIFIED via docker-compose that 3 knowledge writes survive a container restart + search recovers from the log. Olares Application Chart (deployment/olares/) prepared but NOT installed on a real Olares (none available here). Next: guided real-Olares install (via Olares Studio) + read-model persistence (removes replicas=1).


CRIT-1 (async EventLog, ADR-0009) and CRIT-2 (pervasive attribution via ambient CallContext) are resolved with tests; EventLog contract passes against REAL Postgres in CI. Secrets (EnvSecretResolver) + enforcing composition scaffolded behind ports. Full governance/ops/deployment/SDK docs; Helm/K8s prepared (not validated); CHANGELOG; versions consistent at 1.0.0-pc.1. 224/225 tests pass (1 real-PG CI-only); fitness 0; CI green (static + tests + real-Postgres).

**GA gated on (owner/infra):** read-model PG persistence; real OIDC IdP; Vault/KMS; cluster-validated deployment; tracing backend; LICENSE decision; human board ratification. Roadmap in review/16 §17.

**Board review (engineering/review/14-ARCHITECTURE-RELEASE-BOARD-REVIEW.md, 2026-06-30):** independent multi-role review found the constitutional architecture sound and enforced, no redesign warranted, remaining work primarily execution. **Recommendation: READY FOR KMOS v1.0 PRODUCTION SUBSTRATE**, subject to named prerequisites. Fold these into the Substrate scope: (a) fix ADR-home inconsistency — Coding Constitution §4 points to empty `architecture/adr/`; ADRs live in `documentation/adr/`; (b) author 4 canonical docs (Platform Vision, Versioning & Compatibility Policy, Release Lifecycle, Governance Model); (c) run `tsc` green FIRST as a named exit gate; (d) ship one SDK capability template + one conformant example extension; (e) designate one canonical reference app.

## Next release: KMOS v1.0 Production Substrate (requires a networked + type-checked + Postgres CI/dev environment)
1. Execute KEP-001 (async EventLog kernel migration) green under `tsc`; declare Architecture Freeze v1.0. Plan: engineering/review/07.
2. Pervasive identity/attribution threading on write paths (same change set as KEP-001).
3. Real PostgreSQL persistence for every service behind existing ports; migrations; DR/replay validated on a real DB.
4. Real OIDC authn/authz + secrets management; re-run security review.
5. CI green end-to-end incl. the database job; deployment validated on a real cluster.
6. Owner LICENSE decision; independent human-board ratification → then GA.

## Owner decisions outstanding
- LICENSE (currently UNLICENSED).
- Provision the CI/networked/Postgres environment for the Substrate release.
