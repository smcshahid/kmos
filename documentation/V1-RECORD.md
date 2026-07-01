# KMOS v1.0 — Permanent Record

This is the human index of the constitutional and engineering record **frozen at
tag `v1.0.0`** (General Availability). The authoritative, immutable copies are:

- the git tag **`v1.0.0`** (a permanent snapshot of the whole repository), and
- the **`kmos-v1.0-record.tar.gz`** asset on the
  [v1.0.0 GitHub release](https://github.com/smcshahid/kmos/releases/tag/v1.0.0)
  (constitution + ADRs + engineering reviews, extracted from the tag).

Architecture Freeze v1.0 (ADR-0012): the kernel, constitution, and catalogs are
protected; this record is append-only.

## Constitutional documents (`constitution/`)
- KMOS-9999 — Implementation Constitution
- KMOS-10005 — Product Vision & Engineering Charter
- CODING-CONSTITUTION.md

## Architecture Decision Records (`documentation/adr/`) — 12
- 0001 TypeScript + Postgres-first + modular-monolith-first
- 0002 Canonical kernel as single source of truth
- 0003 Ports and adapters
- 0004 Async EventLog kernel migration (KEP-001, plan)
- 0005 Event-bus enforced attribution + authorization
- 0006 HTTP API server + reference web UI
- 0007 KMOS Conformance Kit
- 0008 Align canonical generic defaults (type soundness)
- 0009 Asynchronous EventLog kernel migration (resolves CRIT-1)
- 0010 Olares Application Chart as the reference self-hosted deployment
- 0011 Read-model recovery via state-carried events + boot hydration
- 0012 Architecture Freeze v1.0: kernel protected; application-driven evolution

## Engineering reviews (`engineering/review/`) — 20
- 00–14 Certification, architecture, compliance, debt, readiness, remediation,
  kernel-evolution plan, RC/consultancy/hardening closeouts, repo audit,
  source-control plan, production-foundation closeout, architecture-release board.
- 15 General Availability Assessment
- 16 Production Candidate Close-out
- 17 Olares Deployment Report
- 18 Olares Deployment Validation Report
- 19 **General Availability Certification** (single-node self-hosted / Olares)

## Living operational memory (not frozen — continues past v1.0)
`engineering/IMPLEMENTATION_STATUS.md`, `DECISIONS.md`, `KNOWN_ISSUES.md`,
`NEXT_TASK.md`, and `CHANGELOG.md` continue to evolve; the frozen record above is
their v1.0 snapshot.
