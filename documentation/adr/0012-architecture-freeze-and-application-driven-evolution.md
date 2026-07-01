# ADR 0012 — Architecture Freeze v1.0: kernel as protected asset; application-driven evolution

## Status

**Accepted.** Declared at **v1.0.0 GA** (see
[`engineering/review/19`](../../engineering/review/19-GENERAL-AVAILABILITY-CERTIFICATION.md)).
Governs KMOS from v1.0 onward. Builds on ADR-0002 (kernel as single source of
truth), ADR-0009 (the model for a governed kernel change), and ADR-0011 (read
models are derived from the kernel's durable log).

## Context

KMOS v1.0.0 is GA and validated on a real self-hosted target. The constitutional
architecture is proven. To make KMOS a platform that survives for years and can be
handed to other teams, the kernel must stop being a place where speculative change
accumulates, and evolution must be pulled by real needs rather than pushed by
speculation.

## Decision

1. **Architecture Freeze v1.0.** The canonical kernel (`packages/canonical-kernel`),
   the constitution (`constitution/`), and the canonical catalogs (`reference/`) are
   **frozen**. Post-v1.0 changes to them require the **KMOS-9999 §20 kernel-migration
   review** plus owner approval (enforced via `.github/CODEOWNERS` + branch
   protection). ADR-0009 (KEP-001) is the worked precedent for such a change.

2. **The kernel is a protected asset.** No speculative kernel expansion. Future
   flexibility comes **only** from adapters, capabilities, services, SDKs,
   extensions, and applications — never from growing the kernel. `FROZEN.md` in the
   kernel package states the rules at the source.

3. **Application-driven evolution.** From v1.0 onward, KMOS evolves in response to
   the **concrete, evidenced needs of real applications built ON KMOS** — not
   speculation. Every proposed change SHOULD cite the real application requirement
   it serves. Roadmap items (multi-replica HA, managed-cloud profiles, distributed
   tracing, the Olares-identity→CallContext bridge) are pulled by demand and
   certified with their own evidence when a real application requires them.

4. **Permanent v1 record.** The constitution, ADRs, and engineering reviews at tag
   `v1.0.0` are archived as the immutable v1 record: the git tag `v1.0.0`, the
   `kmos-v1.0-record.tar.gz` asset on the v1.0.0 GitHub release, and the index at
   `documentation/V1-RECORD.md`.

## Consequences

- The kernel stays small, stable, and understandable for the long term; the
  "future flexibility from adapters, not kernel" principle is now enforced, not
  merely aspirational.
- Change becomes disciplined and evidence-driven: no feature is added "just in
  case," and each addition is traceable to a real application need.
- Contributors get a clear, machine-checkable boundary (CODEOWNERS + `FROZEN.md` +
  fitness rules) around what is protected.
- The v1 record is citable and immutable, so future engineers can see exactly what
  was decided and proven, without historical knowledge of this project.

## Alternatives considered

- **Leave the kernel open to change.** Rejected: invites drift and erodes the
  single-source-of-truth guarantee that the whole platform depends on.
- **Roadmap-driven expansion.** Rejected in favor of demand/evidence-driven: a
  roadmap can accumulate speculative scope; real applications cannot.

## References

- `engineering/review/19` (GA certification); `documentation/V1-RECORD.md`;
  `.github/CODEOWNERS`; `packages/canonical-kernel/FROZEN.md`.
- KMOS-9999 §20/§28 (kernel migration process); Coding Constitution §3/§4.
