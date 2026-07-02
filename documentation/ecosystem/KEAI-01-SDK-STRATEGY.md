# Ecosystem SDK Strategy

_KEAI-01 · 2026-07-01._ What the SDK is, what it should become, and — most importantly —
what must never belong in it.

## 1. Current responsibilities (as of KCSI-01)

`@kmos/sdk` today is a **platform-substrate composition factory**:

- `createPlatformRuntime` / `createPlatformRuntimeFromEnv` — compose the 8 platform
  services on one canonical bus, with a durable/in-memory EventLog and **boot recovery**
  (`hydratePlatformRuntime`, ADR-0011).
- It stops at the platform layer **by design**: domain composition stays in the app
  (KMOS-0200 §17), and the `sdk` layer may not import `domains` (fitness rank rule).

Alongside it, `sdk/` holds **capability/adapter templates** and developer guidance. This
is the right, minimal starting point — extracted on evidence (the substrate boilerplate
every deployable repeats), not speculation.

## 2. Future responsibilities (evidence-gated, in likely order)

Each is added only when a real application demonstrates the need — not before.

1. **Provider-wiring ergonomics** (near-term). A small, typed helper for "select provider
   from config, else reference, with fallback" so apps stop hand-rolling `if (env)`
   selection. Evidence: Knowledge Studio + Media Pipeline both hand-wire it. *Low risk,
   high reuse.*
2. **Quality-tier + resilience helpers** (near-term). Extend the fallback primitive with
   quality tiers (draft/standard/max) and a resilience wrapper (timeout/retry/backoff/
   idempotency). Evidence: AIMPOS capability router + olares-one resilience patterns.
3. **Domain-composition helpers** (medium-term) — *carefully*. Helpers that assemble
   common domain sets on top of the substrate. Must stay in a layer that can legally
   depend on domains (i.e. app-level helpers, **not** in `@kmos/sdk` which sits below
   domains). Likely a separate `@kmos/app-kit` at the application tier.
4. **Scaffolding CLI** (medium-term). `kmos new app` / `kmos add capability` generating a
   conformant skeleton. Evidence trigger: ≥3 applications exist and onboarding cost is
   real.
5. **Published client libraries** (long-term). For out-of-process/remote consumers when
   KMOS is deployed as services rather than a modular monolith. Evidence trigger: a real
   remote consumer.

## 3. What must NEVER belong in the SDK

- **Business logic** — that is a capability, always.
- **Provider SDKs or provider-specific code** — those live in `@kmos/providers` adapters.
- **Domain orchestration inside `@kmos/sdk`** — the SDK sits *below* domains; pulling
  domains down would invert the dependency graph and break fitness. Domain/app helpers
  belong at the application tier.
- **Canonical-type redefinition** — the kernel is the single source of truth.
- **A plugin/registry/discovery/routing framework** — until a real application cannot
  proceed without it. The SDK composes; it does not become middleware.
- **Product semantics** — "trusted"/"published"/"done" are per-application.
- **Hidden global state or ambient I/O** — composition returns explicit handles; effects
  go through ports.

## 4. Long-term API direction

- **Elegant, intent-level, composition-first.** An app author writes
  `createPlatformRuntimeFromEnv()`, injects providers, composes domains, and adds a
  surface — and never learns which engine transcribes or reasons.
- **Stable and additive.** The SDK's surface grows by adding helpers, never by changing
  the composition contract. Backwards compatibility is a promise (Versioning &
  Compatibility policy applies).
- **Thin by conviction.** The SDK's success is measured by how *little* an application
  must write, and by how *invisible* providers and infrastructure remain. If the SDK
  starts accumulating business behavior, that is a smell to reverse.

## 5. Guardrail

The SDK is the ecosystem's most tempting place to over-build (every "convenience" wants a
home there). The rule that keeps it honest is the same as everywhere else: **add a
capability or helper only when a real application proves it, and never put business logic
or provider knowledge behind the SDK's door.**
