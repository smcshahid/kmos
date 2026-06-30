# KMOS - Next Task

_Last updated: 2026-06-30_

## Status: v1.0 Production Foundation COMPLETE. Architecture & Release Board Review PASSED → advance to Production Substrate.

217 tests pass, 0 fitness violations; Conformance Kit all-profiles compliant; runnable server/UI; repository governed + audited. See engineering/review/13-PRODUCTION-FOUNDATION-CLOSEOUT.md.

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
