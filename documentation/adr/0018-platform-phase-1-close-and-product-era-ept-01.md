# ADR 0018 — Platform Phase 1 close, Product Era, and the Future Platform Rule (EPT-01)

## Status

**Accepted-plan** — the formal transition from platform-first to product-first. Consistent
with the whole ADR line (ADR-0012 application-driven evolution … ADR-0017 release readiness)
and the [Ecosystem Constitution](../ecosystem/ECOSYSTEM-CONSTITUTION.md). Plan:
`engineering/EPT-01-PRODUCT-TRANSITION-PLAN.md`. Close-out + Product Era declaration:
`engineering/review/24-EPT-01-PRODUCT-ERA.md`.

## Context

Platform Phase 1 delivered: KMOS v1.0 GA (frozen kernel), a capability layer proven by two
extractions (KCSI-01/02), an ecosystem architecture + constitution (KEAI-01), operational
readiness with real provider independence (ESRI-01), and verified release engineering + the
KMOS Book (ESRI-02). The entire body of work is now merged to `main` with green CI. Two
flagship applications exist and the second was built mostly by composition. The remaining
work is not platform work — it is products.

## Decision

1. **Close Platform Phase 1; begin the Product Era.** Future primary investment targets
   **applications**, not the platform. Evidence: the capability layer + SDK + provider
   config + packaging/release standards let a new app be assembled, not constructed (KCSI-02,
   ESRI-01/02).
2. **Produce one ecosystem release** (`v1.1.0`) bundling KMOS + Knowledge Studio + Podcast
   Studio, via automated `release.yml` (images + Olares chart + checksums + notes), with the
   GitHub Release as the authoritative download. Verify — not assume — it succeeded.
3. **Adopt the Future Platform Rule as a permanent architectural principle** (Mission 12),
   recorded as **Ecosystem Constitution Article XI**:

   > *No platform enhancement shall be undertaken unless demanded by a real application or
   > supported by clear evidence from multiple applications.*

   Why: this rule is the distilled lesson of five initiatives. Every durable capability was
   pulled by real use; every avoided over-abstraction protected simplicity. Making it
   permanent guarantees the platform stays small and comprehensible through the Product Era,
   and that platform effort is always justified by product need, never by speculation.
4. **Recommended engineering effort allocation: ~90% applications / ~10% platform** — the
   10% reserved for demand-pulled capability extraction, provider adapters, and operations,
   never speculative platform growth.

No platform redesign; no speculative capabilities; no new frameworks; kernel stays frozen.

## Consequences

- The organization operates product-first with a clear, evidence-based mandate.
- The platform is protected from speculative growth by a permanent, machine-checkable-in-
  spirit rule; capability growth remains evidence-first with rationale/trigger discipline.
- One canonical ecosystem release + the KMOS Book + ECOSYSTEM-STATUS make the ecosystem
  legible and installable without historical context.

## Alternatives considered

- **Keep investing platform-first.** Rejected — no evidence of a platform gap blocking
  products; would violate the very rule this ADR adopts.
- **Leave the "no speculative platform work" norm implicit.** Rejected — making it an explicit
  permanent principle is what keeps it true under pressure.
- **50/50 or 70/30 effort splits.** Rejected — the maturity evidence (composition-built second
  flagship, green integrated CI, verified releases) supports ~90/10; revisit only on evidence.

## References

- `engineering/review/24-EPT-01-PRODUCT-ERA.md`; `engineering/EPT-01-PRODUCT-TRANSITION-PLAN.md`;
  `documentation/ECOSYSTEM-STATUS.md`; `documentation/VISION-2030.md`; ADR-0012…0017.
