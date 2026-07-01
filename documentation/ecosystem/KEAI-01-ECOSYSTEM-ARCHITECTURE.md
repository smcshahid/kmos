# Ecosystem Architecture

_KEAI-01 · 2026-07-01._ The long-term ecosystem: layers, responsibilities, boundaries,
and the allowed/forbidden relationships that keep it durable.

## 1. The four layers

```
┌──────────────────────────────────────────────────────────────────────────┐
│ APPLICATIONS   Knowledge Studio · Media Pipeline · Podcast/Meeting/Research │
│                Studio · MuhammadanWay · Publishing Studio                   │
│  responsibility: user journeys, UI/API, orchestration, provider selection,  │
│                  composition (own the deployable), product semantics        │
└───────────────▲───────────────────────────────────────────────────────────┘
                │ compose + inject (down only)
┌───────────────┴───────────────────────────────────────────────────────────┐
│ CAPABILITY LAYER   capabilities (business work behind contracts)            │
│   @kmos/reference-capabilities (contracts + withFallback)                   │
│   @kmos/providers (real adapters: Ollama, HTTP-ASR, … future: yt-dlp,       │
│                    ffmpeg, IPFS, translation)                               │
│   @kmos/sdk (platform-substrate composition + boot recovery)                │
│   domains/* (media, language, publishing, … journey orchestration)          │
│  responsibility: ALL business logic; provider-first routing; fallback;      │
│                  resilience; deterministic cores                            │
└───────────────▲───────────────────────────────────────────────────────────┘
                │ invoke via runtime/workflow (down only)
┌───────────────┴───────────────────────────────────────────────────────────┐
│ KMOS PLATFORM   canonical kernel (frozen) · events/log · identity ·         │
│                 assets/evidence · knowledge · governance/trust · workflow · │
│                 search · configuration · observability · conformance        │
│  responsibility: system of record, canonical meaning, governance, replay    │
└───────────────▲───────────────────────────────────────────────────────────┘
                │ ports/adapters (down only)
┌───────────────┴───────────────────────────────────────────────────────────┐
│ INFRASTRUCTURE   Olares (K3s/SSO/vGPU) · PostgreSQL · MinIO/S3 · IPFS ·      │
│                  Ollama · Speaches/Whisper · SearXNG · Jellyfin · cloud/K8s  │
│  responsibility: replaceable technology behind ports; nothing canonical here │
└────────────────────────────────────────────────────────────────────────────┘
```

## 2. Responsibilities per layer

| Layer | Owns | Must not |
|---|---|---|
| **Applications** | Journeys, UI/API, orchestration, provider *selection*, composition of the deployable, product semantics | Business computation; canonical-type redefinition; embedding a provider SDK; reaching around a capability to a provider |
| **Capability layer** | All business work behind contracts; provider routing + fallback + resilience; deterministic cores | Transport/UI concerns; importing a platform service's internals; naming itself as the system of record |
| **KMOS platform** | System of record (event log), canonical meaning, identity, governance, workflow, search, config, observability | Business logic; infrastructure imports outside `infrastructure/`; cross-service internal imports |
| **Infrastructure** | Concrete technology behind ports (DB, object store, IPFS, model runtimes, deploy target) | Holding anything canonical/authoritative; being named by an application |

## 3. Boundaries — allowed and forbidden

**Allowed relationships (down the stack only):**

- Application → Capability layer (compose SDK, inject providers, invoke capabilities via
  domains/runtime/workflow).
- Application → KMOS platform (read through business APIs; never bypass governance).
- Capability → KMOS platform (via the runtime/workflow ports and canonical types).
- Capability → its own contract + kernel types.
- Any layer → Infrastructure **only through a port/adapter** in an `infrastructure/`
  boundary.

**Forbidden relationships (enforced by fitness ranks + review):**

- ✗ Capability → application, or platform → capability/application (no upward imports).
- ✗ SDK → domains or applications (the SDK is platform-substrate only).
- ✗ Application → provider (Ollama/Whisper/yt-dlp/ffmpeg/IPFS) directly.
- ✗ Anything → canonical-type redefinition (single source of truth, frozen).
- ✗ Platform service → another platform service's internals (they talk via events + APIs).
- ✗ Business logic in applications, controllers, workflow definitions, or infrastructure.
- ✗ Infrastructure driver import outside an `infrastructure/` directory.

**Machine-enforcement:** in the KMOS monorepo, `tools/fitness-checks/run.mjs` enforces
the import-direction and ports-adapters rules by workspace rank
(`packages 0 · platform/engines 1 · capabilities/sdk 2 · domains 3 · applications 4 ·
products 5`). Out-of-tree applications inherit the same discipline by contract +
conformance.

## 4. Cross-cutting planes (present in every layer, owned by the platform)

- **Identity & attribution** — ambient CallContext; every fact attributable.
- **Governance & trust** — approvals, policy, explainable trust; propose-never-publish
  for AI outputs.
- **Events, lineage & audit** — immutable log; projections rebuildable; provenance
  immutable.
- **Observability** — health, metrics, structured logs; dependency probes as contracts.
- **Configuration & secrets** — scoped/profiled config; secret references; no secrets in
  code/images.

## 5. Deployment topology (Olares-first, portable)

```
Olares One (reference)                       Vanilla K8s / Cloud (portable)
  K3s + Authelia SSO + Envoy + LarePass         K8s + your ingress + your IdP
  shared runtimes: Ollama, Speaches,            managed equivalents behind the
    SearXNG, IPFS (FQDN discovery)                same capability contracts
  per-app Postgres + MinIO (values)            managed Postgres + object store
  Hami vGPU time-sharing                        node GPUs / cloud GPU
```

The application artifact is identical across targets; only adapters/values change.
Verification is **authoritative on the real target**, not on a developer machine.

## 6. How this stays stable for a decade

The four layers and the forbidden-relationship list are the invariants. Providers,
models, media engines, deploy targets, and whole applications are expected to change
*within* this frame. Because dependencies point down only and the kernel is frozen, a
change at any layer cannot corrupt the layers below it — which is precisely why the
knowledge core, and the meaning of the institution's knowledge, survive every
technology cycle above it.
