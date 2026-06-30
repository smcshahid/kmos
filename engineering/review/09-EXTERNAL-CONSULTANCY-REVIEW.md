# KMOS — External Engineering Consultancy Review (long-term adoption readiness)

**Engagement:** Independent consultancy assessment for long-term (decade-horizon) adoption.
**Date:** 2026-06-30
**Lens:** Beyond feature completion — maintainability, operability, extensibility, developer experience, observability, governance, documentation, ecosystem readiness. Each area: assessment → concrete recommendation → **Include now / Defer (with rationale)**.

## Verdict
KMOS is an unusually disciplined codebase: a zero-dependency canonical kernel, strict single-ownership boundaries enforced by automated fitness functions, an immutable replayable event log, and now a runnable API server + UI. The bones are excellent and constitutionally coherent. The gaps to "confidently evolvable for a decade" are concentrated in **operability (observability wiring), production substrate (persistence/security/async kernel), and ecosystem scaffolding (SDK, conformance kit, OpenAPI/client)** — not in the architecture.

---

## 1. Maintainability — strong
- **Assessment:** Clean DDD; one owner per canonical object; ports-and-adapters; 209 tests; fitness gates that actually fire; a single 97-type event catalog (drift removed). Risk: type-safety is unverified offline (no `tsc`); a few determinism leaks (`subscriptions.updatedAt`, dead-letter timestamp use a non-injected clock); idempotency dedup is unbounded/non-durable; service-local catalog factories are now redundant shims.
- **Recommend:** (a) make a green `tsc` the hard merge gate in CI; (b) thread the injected clock into the two remaining sites; (c) bound/persist the dedup set with the persistence work; (d) delete the redundant catalog shims after KEP-001.
- **Include now:** (b) is trivial and safe. **Defer:** (a)(c) to CI/persistence; (d) to the KEP-001 cycle.

## 2. Operability — the biggest gap
- **Assessment:** `@kmos/observability` (metrics/logging/health) exists but is **not wired into services**; there is no `/metrics` endpoint, no structured request logging, no tracing surface (despite correlation/causation being captured on every event). DR-by-replay is proven only in-memory.
- **Recommend:** wire the observability engine into the bus + API server: per-event metrics counters, structured logs stamped with correlationId, a Prometheus-style `/metrics` endpoint, and a `/trace/:correlationId` view (the data already exists). Add readiness/liveness split to `/health`.
- **Include now:** a `/metrics` endpoint + bus metrics counters are low-risk and verifiable offline. **Defer:** full tracing/log shipping to the deployment cycle.

## 3. Extensibility — strong model, missing scaffolding
- **Assessment:** Capability/extension/connector model is sound; `CapabilityHandler` depends only on the kernel. But `sdk/` is empty — no templates, no scaffolding CLI, no extension packaging tool. Third parties must hand-roll.
- **Recommend:** ship an `sdk/` with capability/domain/application templates and a `kmos new capability|domain|app` generator (zero-dep Node script). Provide an extension manifest validator.
- **Include now:** capability template + a tiny generator script are achievable offline. **Defer:** a published marketplace/registry protocol.

## 4. Developer experience — good, now very good
- **Assessment:** One-command `verify:offline / demo / health / seed / serve` + reference UI + an 11-doc suite + ADRs. Strong for evaluators. Missing: pre-commit hook, a `typecheck` that runs locally (blocked offline), and scaffolding (see §3).
- **Recommend:** add a pre-commit/`prepare` hook running `fitness` + `test`; document the CI typecheck path; ship the generator.
- **Include now:** pre-commit hook + generator. **Defer:** nothing material.

## 5. Observability/governance of change — governance engine vs pervasive enforcement
- **Assessment:** Governance service (policy/approval/certification/trust/audit) is solid and the audit is genuinely append-only. The CRIT-2 enforcement mechanism exists at the bus but is **not pervasive** (service write APIs don't yet require a CallContext). Policy is code-driven but not externalized as policy-as-code.
- **Recommend:** complete pervasive CallContext threading (with KEP-001); add a policy-as-code surface (OPA/Cedar-style adapter behind the existing Authorizer port); add governance/audit export (evidence packages already exist — extend to a signed governance report).
- **Include now:** nothing without the async/identity cycle (avoid partials). **Defer:** all to the KEP-001 + identity cycle. Rationale: doing it half-way reintroduces the exact partial-enforcement debt the owner prohibited.

## 6. Documentation — strong; add generated reference + versioning
- **Assessment:** Architecture/Developer/Deployment/Security/Operations/Capability/Workflow/Troubleshooting/Migration/Getting-Started/Release-Notes + 6 ADRs + this review series. Gap: no generated API reference, no doc versioning, no per-package READMEs.
- **Recommend:** publish the **OpenAPI** spec (done: `documentation/api/openapi.json`) and generate an HTML API reference in CI; add per-package READMEs; version docs alongside releases.
- **Include now:** OpenAPI spec (done) + CONTRIBUTING + SECURITY (done). **Defer:** generated HTML reference to CI.

## 7. Ecosystem readiness — the strategic frontier
- **Assessment:** No client SDK, no published OpenAPI (now added), no formal conformance kit for third-party adapters, no LICENSE decision (currently `UNLICENSED`), no semantic versioning/release automation, no SECURITY disclosure policy (now added).
- **Recommend (high strategic value):**
  1. **KMOS Conformance Kit** — generalize the existing `EventLog` contract test into a published suite any third-party adapter (storage, broker, IdP, search, capability) must pass. This is the single highest-leverage long-term-adoption investment: it lets the ecosystem grow without forking the core.
  2. **OpenAPI + generated client SDK** for the HTTP API (OpenAPI shipped now; client generation in CI).
  3. **LICENSE decision** (owner) + release automation (changesets/semantic-release) + tagged versions.
- **Include now:** OpenAPI (done); a conformance-kit *design note* + the EventLog contract already serves as the seed. **Defer:** full conformance kit + client generation + license/release automation. **Owner decision required:** LICENSE.

---

## Strategic improvements adopted in THIS release (verifiable now)
- Runnable **HTTP API server** (`@kmos/api-server`, node:http, zero-dep) + **reference web UI**, with live HTTP tests (evidence, not assertion).
- **OpenAPI** description (`documentation/api/openapi.json`), **CONTRIBUTING.md**, **SECURITY.md**, ADR-0006.

## Strategic improvements deferred (with rationale)
- Async kernel (KEP-001), pervasive identity, real persistence/OIDC/Vault/mTLS, real-env CI/deploy, Helm/K8s — **environment-gated**; executing blind would fabricate unverifiable capability or risk the certified baseline.
- Policy-as-code, full observability/tracing, SDK generator + conformance kit, license/release automation — **high value but best sequenced** with (or just after) the persistence/async cycle to avoid partial-enforcement debt.

## The one decade-horizon recommendation
Invest early in the **KMOS Conformance Kit** (a published, versioned contract-test suite for every port). It is the mechanism by which KMOS can support Media Pipeline, MuhammadanWay, Preservation, Research, and Publishing — and a third-party ecosystem — for years without the core eroding. The architecture already earns this: every replaceable technology sits behind a port; formalizing those ports as conformance contracts is the highest-leverage durability investment available.
