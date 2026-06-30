# KMOS-0210 (DRAFT) — Capability Runtime

Status: DRAFT (authored by implementation agent; pending governance review).
Derived from: KMOS-0160 (CDK & Runtime Standard — the normative runtime contract), KMOS-0205 (which explicitly EXCLUDES execution), KMOS-0200, KMOS-0008.

## 1. Purpose
Execute registered Capabilities behind their stable business contracts, independently of any specific implementation/AI technology. The Registry catalogs abilities; the Runtime runs them. Capabilities remain isolated, independently versioned, observable, and replaceable (KMOS-0160 §21).

## 2. Concepts
- CapabilityImplementation: a registered executable bound to a Capability id + version, exposing `invoke(input, context) -> output` and `health()`.
- A CapabilityImplementation is provided behind a `CapabilityHandler` PORT — in-process now; out-of-process/WASM/gRPC adapters later (KMOS-0160 §11 packaging independence).

## 3. Responsibilities
- Register/activate implementations for capability ids discovered from the Capability Registry (by id+version; never hardcode locations — KMOS-0160 §13).
- `invoke(capabilityId, input, context)`: resolve the active implementation, enforce input validation against the capability contract, execute with isolation (errors contained — one failing capability never crashes others, KMOS-0160 §21), classify failures (KmosError taxonomy), and return output. Publish execution events.
- Health/readiness per implementation (Unknown/Starting/Ready/Busy/Degraded/Unavailable, KMOS-0160 §14).
- External configuration via the Configuration Service port (KMOS-0160 §9). No business config baked in.
- Idempotent, observable execution; deterministic core (no hidden IO in the coordinator — IO is in the handler adapter).

## 4. Events
CapabilityExecutionStarted, CapabilityExecutionCompleted, CapabilityExecutionFailed, CapabilityRuntimeRegistered. (Local catalog extension until promoted.)

## 5. Ports
CapabilityHandler (the executable), CapabilityResolver (queries the Registry for active id+version), Clock.

## 6. Relationship to Workflow
The Workflow Service coordinates; it invokes the Runtime through a `CapabilityInvoker` port (no cross-service import). The Runtime computes; it never coordinates.

## 7. Acceptance
Capabilities invoked by id+version behind contracts; isolation (a failing capability is contained + dead-letter/failure event); health states; external config; execution events; technology-independent. Tests cover invoke success, contract-violation rejection, isolation/failure classification, health, and AI-model independence (swap handler, same contract).
