# sdk/

Developer SDK: capability/adapter templates and developer guidance for building
**on** KMOS. The authoritative contracts an SDK asset must satisfy are defined by
`packages/conformance` (the KMOS Conformance Kit) and the canonical types in
`@kmos/canonical-kernel`. Everything here is a *template*: copy it into your own
domain/capability package and adapt.

> Working references to learn from: `capabilities/reference-capabilities/` (real
> capabilities) and `platform/events/src/infrastructure/pg-sql-client.ts` (a real
> adapter behind a port).

---

## 1. Capability development template

A **capability** is the only place business work happens (Constitution §5). It
depends on **nothing but the kernel** (a capability outlives any runtime,
KMOS-0120 §3): it is a `descriptor` (how the registry advertises it) plus a
factory `create()` returning a handler with `invoke` + `health`.

```ts
// my-domain/src/capabilities/summarize.ts
import type {
  CapabilityHandler, CapabilityDescriptor, InvocationContext,
} from '@kmos/reference-capabilities'; // or copy contract.ts into your package

export interface SummarizeInput { readonly text: string; readonly maxWords?: number; }
export interface SummarizeOutput { readonly summary: string; readonly words: number; }

/** How the Capability Registry advertises this capability (KMOS-0120 §6). */
export const summarizeDescriptor: CapabilityDescriptor = {
  name: 'Summarize',
  ownerDomain: 'Language',
  businessPurpose: 'Summarize text into a short abstract',
  version: '1.0.0',
  inputs: ['KnowledgeObject'],
  outputs: ['KnowledgeObject'],
  contract: {
    acceptedObjects: ['KnowledgeObject'],
    producedObjects: ['KnowledgeObject'],
    consumedEvents: [],
    publishedEvents: [],
  },
};

/** The implementation. `invoke` MUST be pure w.r.t. its inputs + context for
 *  deterministic replay; do all I/O through injected ports, never ambiently. */
export function createSummarize(): CapabilityHandler<SummarizeInput, SummarizeOutput> {
  return {
    health: () => 'Ready',
    invoke: async (input: SummarizeInput, _ctx: InvocationContext) => {
      const words = Math.min(input.maxWords ?? 30, input.text.split(/\s+/).length);
      return { summary: input.text.split(/\s+/).slice(0, words).join(' '), words };
    },
  };
}
```

### Wiring it into the platform

```ts
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';

// 1) Advertise the contract (governed metadata; no code):
const cap = await registry.registerCapability(summarizeDescriptor);

// 2) Bind an implementation version to the runtime:
await runtime.registerImplementation(cap.id, '1.0.0', createSummarize());

// 3) Invoke it — directly, or (recommended) as a Workflow step so the platform
//    coordinates and records it. The Workflow Service NEVER computes; it delegates
//    to the runtime via the CapabilityInvoker port.
const result = await runtime.invoke(cap.id, { text: '…', maxWords: 20 });
```

### Rules (enforced by conformance + architecture-fitness)

- **Kernel-only imports** — a capability must not import a platform service.
- **Deterministic invoke** — no wall-clock/random/ambient I/O; inject ports.
- **Contract honesty** — declare exactly the objects/events you accept/produce.
- **Version immutably** — new behavior ⇒ new `version`; never mutate a published one.

Run the Conformance Kit (`npm run conformance`) against anything you ship.

---

## 2. Adapter development template

An **adapter** realizes a **port** (an interface a service depends on) against a
concrete technology, and lives under an `infrastructure/` directory (fitness rule
`ports-adapters`). The service depends on the port only — never the driver.

```ts
// my-service/src/infrastructure/redis-cache.ts   (illustrative)
import { createClient } from 'redis';           // the only place the driver appears
import type { CachePort } from '../domain/cache-port.js';

export class RedisCache implements CachePort {
  private readonly client = createClient({ url: process.env.CACHE_URL });
  async get(key: string): Promise<string | undefined> { /* … */ }
  async set(key: string, value: string): Promise<void> { /* … */ }
}
```

Real, in-tree examples to copy: `PgSqlClient`
(`platform/events/src/infrastructure/pg-sql-client.ts`) realizes the `SqlClient`
port over PostgreSQL; `EnvSecretResolver`
(`platform/configuration/src/infrastructure/env-secret-resolver.ts`) realizes the
`SecretResolver` port over environment variables. Both are the pattern: the driver
import is confined to `infrastructure/`; the port stays technology-free.

---

## 3. Status

These are **documented templates**, verified against the working reference
implementations in-tree.

As of **KCSI-01** a real SDK package ships here: [`@kmos/sdk`](./sdk) — the
platform-substrate factory (`createPlatformRuntime` / `createPlatformRuntimeFromEnv` +
boot recovery) that composes the 8 platform services so an application never repeats
the wiring. Real provider adapters live in
[`@kmos/providers`](../capabilities/providers); see
[`documentation/PROVIDER-GUIDE.md`](../documentation/PROVIDER-GUIDE.md). A scaffolding
CLI and published client libraries remain on the roadmap.
