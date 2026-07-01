# @kmos/canonical-kernel — FROZEN (Architecture Freeze v1.0)

This package is the **canonical kernel**: the single source of truth for canonical
objects, the event envelope, schemas, the in-process event bus, replay, and the
security/attribution primitives. As of **v1.0.0 (GA)** it is a **protected, frozen
asset** (ADR-0012; governed by KMOS-9999 §20/§28 and Coding Constitution §3).

## Rules for changing this package

1. **No speculative expansion.** Do not add features to the kernel "just in case."
   Future flexibility comes ONLY from adapters, capabilities, services, SDKs,
   extensions, and applications — never from kernel growth.
2. **Governed change only.** Any change here requires the **kernel-migration review
   process** (KMOS-9999 §20) and owner approval (see `.github/CODEOWNERS`). ADR-0009
   (KEP-001, the async-EventLog migration) is the worked model for such a change.
3. **Backward-compatible.** The persisted event format and the canonical catalogs
   are stable; changes must be additive and pass the schema registry's BACKWARD
   compatibility mode. Treat every change as breaking until proven otherwise.
4. **Evidence, not speculation.** A proposed kernel change must cite the concrete,
   real-application requirement it serves (ADR-0012).

See ADR-0002 (kernel as single source of truth), ADR-0009 (governed kernel
migration), ADR-0011 (read models are derived from the kernel's log), and ADR-0012
(freeze + application-driven evolution).
