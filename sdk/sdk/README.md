# @kmos/sdk

The KMOS **application SDK**. Compose the platform substrate once; build your
application (domains + a thin UI/API) on top — without repeating the wiring every
deployable otherwise hand-rolls.

Extracted from Knowledge Studio under **KCSI-01** (evidence-first): the substrate
factory generalizes `products/knowledge-studio/src/platform.ts:47-102`. See
[`documentation/CAPABILITY-EVOLUTION-ROADMAP.md`](../../documentation/CAPABILITY-EVOLUTION-ROADMAP.md) §3.

## What it composes

`createPlatformRuntime` / `createPlatformRuntimeFromEnv` wire the **8 platform
services** on one canonical event bus — identity, assets, knowledge, governance,
events, capability-registry, capability-runtime, search — with a durable PostgreSQL
`EventLog` (or in-memory) and **read-model recovery on boot** (`hydratePlatformRuntime`,
ADR-0011).

```ts
import { createPlatformRuntimeFromEnv } from '@kmos/sdk';

const rt = await createPlatformRuntimeFromEnv({ enforce: true }); // durable if KMOS_DATABASE_URL set
// add YOUR domains on top (composition of domains belongs to the app, KMOS-0200 §17):
const language = new LanguageDomainService({ bus: rt.bus, knowledge: rt.knowledge, registry: rt.registry, runtime: rt.runtime });
```

## Boundary (by design)

The SDK stops at the **platform layer**. Domain composition (media, language, …) and
provider selection stay in the application: an app owns its composition
(KMOS-0200 §17), and the `sdk` layer may not import `domains` under the architecture
fitness dependency rule. Provider adapters live in [`@kmos/providers`](../../capabilities/providers);
the app injects them into its domains.
