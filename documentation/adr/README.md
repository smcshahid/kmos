# Architecture Decision Records (ADRs)

This directory holds the KMOS Architecture Decision Records in standard ADR
format (Context / Decision / Status / Consequences). ADRs are distilled from the
engineering decisions log `engineering/DECISIONS.md`, which remains the living
source of truth; these files are the stable, citable architectural record.

## Status legend

- **Accepted** — confirmed and in force.
- **Accepted-plan** — the decision/plan is accepted, but execution is pending
  (e.g. gated on a CI environment).
- **Proposed** — recommended default, awaiting confirmation.
- **Superseded** — replaced by a later ADR.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-typescript-postgres-modular-monolith.md) | TypeScript + Postgres-first + modular-monolith-first | Accepted |
| [0002](0002-canonical-kernel-single-source-of-truth.md) | Canonical kernel as single source of truth | Accepted |
| [0003](0003-ports-and-adapters.md) | Ports and adapters (infrastructure behind ports) | Accepted |
| [0004](0004-async-eventlog-kernel-migration.md) | Async EventLog kernel migration (KEP-001) | Accepted-plan |
| [0005](0005-event-bus-enforced-attribution-authorization.md) | Event-bus enforced attribution + authorization | Accepted (mechanism) |
| [0006](0006-http-api-server-and-reference-ui.md) | HTTP API server + reference web UI | Accepted |
| [0007](0007-conformance-kit.md) | KMOS Conformance Kit (ecosystem integrity) | Accepted |
| [0008](0008-align-canonical-generic-defaults.md) | Align canonical generic defaults with their bound (type soundness) | Accepted |
| [0009](0009-async-eventlog-kernel-migration.md) | Asynchronous EventLog kernel migration (KEP-001, resolves CRIT-1) | Accepted |
| [0010](0010-olares-reference-deployment.md) | Olares Application Chart as the reference self-hosted deployment | Accepted (validated on real Olares) |
| [0011](0011-read-model-recovery.md) | Read-model recovery via state-carried events + boot hydration | Accepted |
| [0012](0012-architecture-freeze-and-application-driven-evolution.md) | Architecture Freeze v1.0: kernel protected; application-driven evolution | Accepted |
| [0013](0013-provider-capability-extraction-kcsi-01.md) | Provider-independent capability extraction from Knowledge Studio (KCSI-01) | Accepted (executed) |
| [0014](0014-ecosystem-architecture-and-constitution-keai-01.md) | KMOS Ecosystem Architecture, Constitution, and evidence-first growth (KEAI-01) | Proposed |
| [0015](0015-podcast-studio-and-content-processing-spine-kcsi-02.md) | Podcast Studio and the Content Processing Spine (KCSI-02) | Accepted (executed) |
| [0016](0016-provider-configuration-and-operational-readiness-esri-01.md) | Provider configuration model & operational readiness (ESRI-01) | Accepted (executed) |
| [0017](0017-kmos-book-and-release-verification-esri-02.md) | The KMOS Book, verified release engineering & automated packaging (ESRI-02) | Accepted (executed) |
| [0018](0018-platform-phase-1-close-and-product-era-ept-01.md) | Platform Phase 1 close, Product Era, and the Future Platform Rule (EPT-01) | Accepted-plan |

## Source decisions

These ADRs consolidate decisions D-A..D-F, D-005/D-006, MED-5, CRIT-2, and the
KEP-001 kernel evolution plan. See `engineering/DECISIONS.md`,
`engineering/review/06-REMEDIATION-CERTIFICATION-REPORT.md`, and
`engineering/review/07-KERNEL-EVOLUTION-PLAN.md` for full history and evidence.
