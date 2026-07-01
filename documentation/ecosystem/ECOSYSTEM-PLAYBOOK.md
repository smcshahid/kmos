# The KMOS Ecosystem Playbook

_The operational handbook for building on KMOS._ If you are a new engineer (human or AI),
read the [Ecosystem Constitution](ECOSYSTEM-CONSTITUTION.md) and this one document, and you
can build the next application correctly. Everything here links to the authoritative detail
doc for each topic — this is the map, not a duplicate.

_ESRI-01 · 2026-07-01. One authoritative playbook; per-topic detail lives in the linked docs._

---

## 0. The 60-second model

Applications **orchestrate**; capabilities **perform work**; providers are **replaceable and
invisible**; knowledge is **permanent**. Dependencies point **down only**
(`applications → capabilities/sdk → platform → infrastructure`). Grow the ecosystem
**only on evidence** (a second consumer), never speculatively.

---

## 1. Build a new application

1. Scaffold `products/<app>` (or `applications/<app>`); copy the shape of Knowledge Studio /
   Podcast Studio (**the packaging standard**, [PACKAGING-STANDARD.md](../PACKAGING-STANDARD.md)).
2. Compose the substrate with `@kmos/sdk` (`createPlatformRuntimeFromEnv`) — you get
   knowledge, assets, governance, events, workflow, search, identity, config + boot recovery.
3. Model your journey as domain orchestration coordinating capabilities via the Workflow
   Service. **No business logic in the app.**
4. Inject providers from `@kmos/providers` via **configuration** (never name an engine —
   [Provider Guide](../PROVIDER-GUIDE.md)).
5. Reuse shared projections (`@kmos/content-projections`) and add only product-specific
   surface (UI/API, read models).
6. Verify (below), then request manual validation **last**.

Detail: [Ecosystem Development Guide](KEAI-01-ECOSYSTEM-DEVELOPMENT-GUIDE.md),
[SDK Strategy](KEAI-01-SDK-STRATEGY.md), platform [ARCHITECTURE](../ARCHITECTURE.md).

## 2. Use existing capabilities

Available today: `@kmos/content-projections` (transcript/chapters/evidence),
`@kmos/providers` (Ollama + OpenAI-compatible knowledge extraction, HTTP ASR),
`@kmos/reference-capabilities` (+ `withFallback`), `@kmos/sdk` (substrate), and the platform
services. Inject them; never re-implement. Inventory:
[Capability Inventory](KEAI-01-CAPABILITY-INVENTORY.md).

## 3. When to extract a new capability

**Build first, extract on the second consumer.** When a second real app needs the same work
and it passes the Article II tests (contract-stable, provider-replaceable, cross-app,
kernel-only, deterministic-core), extract it, refactor **both** consumers, prove parity, and
record a **promotion rationale** (or a **trigger** if deferring) in the
[Capability Evolution Roadmap](../CAPABILITY-EVOLUTION-ROADMAP.md). No registries/frameworks.
Detail: Constitution Art. IV, Development Guide §2.

## 4. Repository standards

Conventional Commits; feature branch → PR (never commit to the default branch); one
canonical doc per topic; ADR every architectural decision (update the
[ADR index](../adr/README.md) + [DECISIONS](../../engineering/DECISIONS.md) in the same
change); immutable images, secrets injected at install. Governance:
[GOVERNANCE-MODEL](../GOVERNANCE-MODEL.md).

## 5. Testing expectations

Deterministic cores unit-tested offline; adapters tested against a local double (both success
+ every degradation path); behavior parity on any extraction; E2E on the real target; and
`fitness` + `conformance` in CI. Offline: `npm run verify:offline` (fitness + node:test).
Detail: [Developer Guide](../DEVELOPER-GUIDE.md), [CONFORMANCE](../CONFORMANCE.md).

## 6. Provider integration

Providers live in `@kmos/providers` behind capability contracts; apps select by config
(`KMOS_LLM_PROVIDER` / `BASE_URL` / `MODEL` / `API_KEY`). Adding a provider = adapter + config,
never an app change. Full matrix + extension points: [Provider Guide](../PROVIDER-GUIDE.md).

## 7. Deployment (Olares-first, portable)

Immutable image → private registry → Olares Application Chart (or vanilla K8s via values).
FQDN service discovery; secrets at install; the same shared PostgreSQL for the durable event
log + job state. Verify on the real estate — it is authoritative. Detail:
[DEPLOYMENT-GUIDE](../DEPLOYMENT-GUIDE.md), [OLARES-DEPLOYMENT-GUIDE](../OLARES-DEPLOYMENT-GUIDE.md),
[OPERATIONS-GUIDE](../OPERATIONS-GUIDE.md), [DEPLOYMENT-DECISION-GUIDE](../DEPLOYMENT-DECISION-GUIDE.md).

## 8. Release process

Versioning + compatibility ([VERSIONING-AND-COMPATIBILITY](../VERSIONING-AND-COMPATIBILITY.md)),
release lifecycle ([RELEASE-LIFECYCLE](../RELEASE-LIFECYCLE.md)), reproducible Docker/tag/
publish/rollback ([RELEASE-AND-DOCKER.md](../RELEASE-AND-DOCKER.md)), upgrade/rollback
([UPGRADE-GUIDE](../UPGRADE-GUIDE.md)), backup/DR ([BACKUP-AND-RESTORE](../BACKUP-AND-RESTORE.md),
[DISASTER-RECOVERY](../DISASTER-RECOVERY.md)). Track three versions independently: app/code,
config/profile, output/contract.

## 9. Architecture review & promotion process

Propose (plan + ADR citing evidence) → review (architecture/DX/maintainability; check Art. II
+ fitness) → extract (small, behavior-preserving WPs) → record (roadmap) → close out
(independent review + honest proven/deferred assessment). This is the KCSI cadence used by
KCSI-01/02.

## 10. Manual validation (the final step)

Human validation happens **only after** every engineering gate is green — see the
[Release Readiness Checklist](../RELEASE-READINESS-CHECKLIST.md) and
[Manual Testing Philosophy](../MANUAL-TESTING-PHILOSOPHY.md). Do not ask a human to verify
what engineering can verify. Human validation focuses on **experience**, not correctness.

---

## Quick index

| Topic | Authoritative doc |
|---|---|
| Ecosystem principles | [ECOSYSTEM-CONSTITUTION](ECOSYSTEM-CONSTITUTION.md) |
| Build an app / extract capabilities | [Development Guide](KEAI-01-ECOSYSTEM-DEVELOPMENT-GUIDE.md) |
| Capability inventory / roadmap | [Inventory](KEAI-01-CAPABILITY-INVENTORY.md) · [Roadmap](../CAPABILITY-EVOLUTION-ROADMAP.md) |
| Providers & configuration | [Provider Guide](../PROVIDER-GUIDE.md) |
| SDK | [SDK Strategy](KEAI-01-SDK-STRATEGY.md) |
| Packaging standard | [PACKAGING-STANDARD](../PACKAGING-STANDARD.md) |
| Deployment / Olares / operations | [DEPLOYMENT](../DEPLOYMENT-GUIDE.md) · [OLARES](../OLARES-DEPLOYMENT-GUIDE.md) · [OPERATIONS](../OPERATIONS-GUIDE.md) |
| Release / Docker | [RELEASE-AND-DOCKER](../RELEASE-AND-DOCKER.md) · [RELEASE-LIFECYCLE](../RELEASE-LIFECYCLE.md) |
| Readiness gates | [Release Readiness Checklist](../RELEASE-READINESS-CHECKLIST.md) · [Manual Testing Philosophy](../MANUAL-TESTING-PHILOSOPHY.md) |
| Governance | [GOVERNANCE-MODEL](../GOVERNANCE-MODEL.md) · [ADRs](../adr/README.md) · [DECISIONS](../../engineering/DECISIONS.md) |
