# extensions/

Governed, independently-installable platform extensions (KMOS-0170): packaged
bundles that contribute capabilities, workflows, knowledge models, connectors, or
UI **without forking the platform**. This is the reserved, governed location for
them. Every extension must pass the KMOS Conformance Kit (`packages/conformance`)
before it is admitted. No production extensions ship in v1.0.

---

## Extension development template

An extension is a workspace package that composes SDK-built assets (see
[`sdk/`](../sdk/README.md)) behind a small, declarative **manifest** plus a
`register()` entry point. The platform stays closed to modification and open to
extension: an extension only *adds* capabilities/workflows/connectors through the
existing registries — it never reaches into a service's internals (enforced by the
`dep-direction` and `cross-service` fitness rules).

```ts
// extensions/my-extension/src/index.ts
import { summarizeDescriptor, createSummarize } from './capabilities/summarize.js';
import type { CapabilityRegistryService } from '@kmos/capability-registry';
import type { CapabilityRuntimeService } from '@kmos/capability-runtime';

/** Declarative manifest — what this extension contributes (governed metadata). */
export const manifest = {
  name: 'my-extension',
  version: '1.0.0',
  requiresPlatform: '>=1.0.0',
  contributes: {
    capabilities: [summarizeDescriptor.name],
    workflows: [],
    connectors: [],
    knowledgeModels: [],
  },
} as const;

/** Idempotent installation: register everything this extension contributes. The
 *  host passes in the platform services; the extension imports no service
 *  internals, only their public registration APIs. */
export async function register(host: {
  readonly registry: CapabilityRegistryService;
  readonly runtime: CapabilityRuntimeService;
}): Promise<void> {
  const cap = await host.registry.registerCapability(summarizeDescriptor);
  await host.runtime.registerImplementation(cap.id, summarizeDescriptor.version, createSummarize());
}
```

### Rules an extension must satisfy (admission gate)

- **Conformance** — `npm run conformance` passes for everything it contributes.
- **No internals** — contributes only through public registration APIs; never
  imports another service's `src/` internals (fitness-enforced).
- **Declared contributions** — the manifest lists exactly what is added; the
  admitted capabilities/events must match their declared contracts.
- **Versioned + reversible** — `register()` is idempotent; contributions are
  versioned immutably; an extension can be omitted without breaking the core.
- **Governed** — capabilities it adds are subject to the same Governance Service
  certification/approval flow as first-party ones.

### Status

This is a **documented template** grounded in the real capability/runtime
registration APIs used across the platform. A packaged extension format (signed
bundles, an install/registry CLI, dependency resolution) is on the roadmap
(`documentation/GOVERNANCE-MODEL.md`, GA assessment); it is not shipped in v1.0.
