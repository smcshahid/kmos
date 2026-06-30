# ADR 0008 — Align canonical generic defaults with their bound (type soundness)

## Status

**Accepted (implemented).** Landed on `main` (the green tip after CI run #2), CI green end-to-end (static + tests + database jobs). Touches the canonical kernel and the canonical `AssetType` union, so it is recorded as a governed kernel change per KMOS-9999 §20/§28 and the Coding Constitution §3 ("canonical types are sacred — changed via review, never ad hoc"). Taken **pre-Architecture-Freeze v1.0** on purpose; after freeze this would require the full constitutional migration process. Complements ADR-0002 (canonical kernel as single source of truth).

## Context

This change resolves the first-ever execution of `tsc --build` against the full tree. Until the repository reached a real toolchain, type-checking had never run — the residual risk the Architecture & Release Board Review flagged as **R-A: "type soundness has never been verified"** (`engineering/review/14`). CI exposed **65 type errors across 14 files** plus 6 trivial lint errors. The snapshot compiled in principle but had never actually been compiled.

The errors collapsed to a few root causes, dominated by one kernel issue (~58 sites):

- `CanonicalObject`, `CanonicalEvent`, and `StoredEvent` are generic over their body/payload shape. The type parameter was **bounded** at `extends object` but **defaulted** to `Record<string, unknown>`.
- Every concrete canonical body/payload is declared as a TypeScript `interface`. Interfaces do **not** receive an implicit index signature, so an interface body satisfies the bound (`object`) but is **not assignable to** the default (`Record<string, unknown>`). Wherever the generic defaulted, the compiler rejected the interface body.

The default contradicted the bound, invisibly, because the compiler never ran. This is operationalization of the existing design (canonical bodies were always intended to be strongly-typed interfaces), not a redesign.

## Decision

1. **Kernel (canonical types).** Change the *default* type argument of the canonical generics from `Record<string, unknown>` to `object`, matching the existing bound: `CanonicalObject<T extends object = object>`, `CanonicalEvent<P extends object = object>`, `StoredEvent<P extends object = object>`. The **bound is unchanged**. Compile-time only — no runtime behavior, event format, or data migration. Safe: no code indexes `body`/`payload` by arbitrary key (verified by repository-wide search for `.body[`/`.payload[`).

2. **Canonical model (AssetType).** Complete the canonical `AssetType` union (`platform/assets/src/domain/asset-types.ts`, derived from KMOS-0202) with members `'Media'` and `'Publication'`, already produced by the Media/Publishing domains and asserted by the certification/integration suites. Additive, not breaking.

3. **Non-canonical implementation fixes (recorded for completeness).** `IdentityService.require` re-generalized over `CanonicalObject` (prior bound unsatisfiable); `InvocationContext` gained optional `organizationId` for tenant propagation (consistent with CRIT-2, ADR-0005); 5 unused imports + 1 `prefer-const` cleaned up.

## Consequences

- **R-A is closed.** KMOS compiles clean under `tsc --build`; CI static, tests, and database jobs are green. Type soundness is now an enforced gate.
- **No behavioral or data change.** The 217-test suite, the Conformance Kit (all profiles compliant), and the end-to-end demo are unchanged.
- **Stronger, not weaker, typing.** Only the default (not the bound) was loosened, so untyped usages resolve to `object` (members must be narrowed) rather than to a false index signature inviting arbitrary-key access.
- **Precedent.** Canonical bodies/payloads are interface-typed and never accessed by arbitrary key. Future canonical objects/events must be interfaces and must not rely on index access to `body`/`payload`; a future fitness rule could enforce this.
- **Timing.** Appropriately taken before Architecture Freeze v1.0. A small, mechanical correction — exactly what the board review predicted the Production Substrate environment would surface ("execution, not unresolved design").

## Alternatives considered

- **Add explicit index signatures to every canonical body interface.** Rejected: pollutes every type, weakens safety, legitimizes arbitrary-key access.
- **Convert canonical bodies from `interface` to `type` aliases.** Rejected: large churn, loses declaration-merging, doesn't uniformly address `payload`/`StoredEvent`.
- **Keep the `Record<string, unknown>` default and cast at the ~58 call sites.** Rejected: scatters casts, symptom not cause, hides the model.

## References

- Board review R-A: `engineering/review/14-ARCHITECTURE-RELEASE-BOARD-REVIEW.md`.
- ADR-0002 (kernel single source of truth); ADR-0005 (enforced attribution/authorization).
- Specs: KMOS-0100, KMOS-0202; governance: KMOS-9999 §20/§28, Coding Constitution §3.
