# ADR 0007 — KMOS Conformance Kit (ecosystem integrity)

## Status
Accepted (implemented, self-certifying).

## Context
As KMOS moves toward supporting many products/implementations, architectural
integrity must be protected by something more durable than code review. The
platform already isolates replaceable technology behind ports; those ports need
published, enforceable contracts.

## Decision
Ship `@kmos/conformance`: a framework-agnostic kit defining compliance
**profiles** (EventLog, Authorizer, CapabilityHandler, canonical object/event)
and **levels** (Core/Certified/Reference), with a `runConformance` runner that
produces a serializable report, a CLI (`npm run conformance`), and self-tests
that certify the kernel's reference adapters and detect non-compliant ones. It
depends only on the canonical kernel.

## Consequences
- Any implementation/adapter/SDK/third party can self-certify and ship evidence.
- The same EventLog contract validates sync and async adapters — protecting the
  storage-replaceability invariant through KEP-001 and beyond.
- CI runs the kit; future work gates the extension marketplace on Certified level.
- The kit is versioned with the platform and becomes the authoritative definition
  of "KMOS-compliant".
