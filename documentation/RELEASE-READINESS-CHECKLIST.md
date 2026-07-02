# Release Readiness Checklist

_Every KMOS application must satisfy this checklist **before** a human is asked for manual
validation._ ESRI-01. This is the gate between engineering verification and product
validation (see [Manual Testing Philosophy](MANUAL-TESTING-PHILOSOPHY.md)).

Copy this into the release PR and tick every box. If any box is unchecked, the app is **not**
ready for manual validation.

## Engineering (all must be green — automated)

- [ ] **Architecture review** complete; plan + ADR recorded; fitness legal (no upward deps).
- [ ] **Tests** green — unit (offline) + integration + E2E on the real target; degradation
      paths covered.
- [ ] **Fitness** — `npm run fitness` → 0 violations.
- [ ] **Conformance** — `npm run conformance` → all profiles COMPLIANT.
- [ ] **CI** green end-to-end (lint + typecheck + fitness + tests + real-DB job where applicable).
- [ ] **Container verified** — the self-verifying image builds (Dockerfile runs `npm run verify`).
- [ ] **Deployment package verified** — Olares chart / K8s manifests render; image pinned to
      a specific `:<semver>`.
- [ ] **Independent review** complete (architecture / DX / maintainability; honest debt).

## Platform & operations

- [ ] **Provider independence** — providers selected by config; app names no engine; switching
      is env, not code ([Provider Guide](PROVIDER-GUIDE.md)).
- [ ] **Recovery** — durable EventLog + boot recovery verified; interrupted jobs recover
      retryable.
- [ ] **Upgrade / rollback** — documented and reversible ([RELEASE-AND-DOCKER](RELEASE-AND-DOCKER.md),
      [UPGRADE-GUIDE](UPGRADE-GUIDE.md)); previous image pinned + retained.
- [ ] **Security** — secrets injected at install (none in git/image); attribution/governance
      intact; STRIDE items reviewed ([SECURITY-REVIEW](SECURITY-REVIEW.md)).
- [ ] **Performance** — no regressions at target scale; heavy work is provider/infra-bound by
      design.
- [ ] **Health & observability** — `/health` + dependency probes; logs/metrics available.
- [ ] **Olares** — chart installs; FQDN discovery; `entrance.host` == Service == release name;
      Olares PostgreSQL consumed (no bundled DB).

## Documentation & governance

- [ ] **Docs** — README (Vision + User Guide), ARCHITECTURE, and any new capability's roadmap
      row (rationale) / deferral (trigger) updated.
- [ ] **Packaging** — conforms to [PACKAGING-STANDARD](PACKAGING-STANDARD.md).
- [ ] **Versioning** — app/code, config/profile, output/contract versions set independently;
      DECISIONS/ADR updated; release notes drafted.
- [ ] **Accessibility** — UI meets the product's a11y bar (keyboard, contrast, labels).

## Handoff

- [ ] Every box above is checked.
- [ ] A short **manual-validation script** (experience-focused, not correctness) is prepared
      for the human — per the [Manual Testing Philosophy](MANUAL-TESTING-PHILOSOPHY.md).

Only now is the application handed to a human for manual validation.
