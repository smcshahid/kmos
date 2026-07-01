# KMOS Provider Guide

How to add a **provider** (a real technology behind a capability contract) and how an
application consumes it — without the application ever knowing which provider runs.

> Introduced by **KCSI-01**. Providers live in
> [`@kmos/providers`](../capabilities/providers); applications compose the substrate
> with [`@kmos/sdk`](../sdk/sdk) and inject providers into their domains. The
> lifecycle of every provider capability is tracked in
> [`CAPABILITY-EVOLUTION-ROADMAP.md`](CAPABILITY-EVOLUTION-ROADMAP.md).

## 1. The model

- A **capability contract** (e.g. `KnowledgeExtraction`, `Transcription` in
  `@kmos/reference-capabilities`) is the stable business seam. It never changes when a
  provider changes.
- A **provider adapter** is a `CapabilityHandler` (or `ReferenceCapability`) that
  satisfies a contract using a concrete technology (Ollama, an HTTP ASR service, …).
- **Selection** is the application's one-line choice (usually "use provider X when
  configured, else the reference default"). There is deliberately **no** registry,
  discovery, or routing engine — none is warranted yet (ADR-0013; roadmap §4).
- **Fallback / graceful degradation** is the shared `withFallback` primitive.

## 2. Add a provider adapter

```ts
// capabilities/providers/src/knowledge-extraction/my-llm.ts
import type { CapabilityHandler, ExtractionInput, ExtractionOutput, ReferenceCapability } from '@kmos/reference-capabilities';
import { knowledgeExtraction, withFallback } from '@kmos/reference-capabilities';

export function createMyLlmExtraction(opts: { url: string }): ReferenceCapability<ExtractionInput, ExtractionOutput> {
  const provider: CapabilityHandler<ExtractionInput, ExtractionOutput> = {
    health: () => 'Ready',
    invoke: async (input) => ({ concepts: await callMyLlm(opts.url, input.text) }), // HTTP via global fetch
  };
  return {
    descriptor: { /* name, ownerDomain, version, inputs/outputs, contract */ } as never,
    // Graceful degradation: any error or empty result → the deterministic reference.
    create: () => withFallback(provider, knowledgeExtraction.create(), { usable: (o) => o.concepts.length > 0 }),
  };
}
```

Rules (enforced by fitness + conformance):
- **Contract-only + kernel-only deps.** Depend on `@kmos/reference-capabilities`
  (same layer) and the kernel — never a platform service or an upper layer.
- **No provider SDK.** Use the global `fetch`; keep driver imports (if ever needed)
  under an `infrastructure/` directory.
- **Never throw for "unavailable."** Return an unusable result and let `withFallback`
  (or the caller) degrade honestly.
- **Version immutably.** New behavior ⇒ new descriptor `version`.

## 3. Consume it from an application

```ts
import { createPlatformRuntimeFromEnv } from '@kmos/sdk';
import { createMyLlmExtraction } from '@kmos/providers';
import { LanguageDomainService } from '@kmos/language';

const rt = await createPlatformRuntimeFromEnv({ enforce: true });
const extraction = process.env.MY_LLM_URL ? createMyLlmExtraction({ url: process.env.MY_LLM_URL }) : undefined;
const language = new LanguageDomainService({
  bus: rt.bus, knowledge: rt.knowledge, registry: rt.registry, runtime: rt.runtime,
  ...(extraction ? { extraction } : {}),   // inject — the app never imports the provider's HTTP
});
```

The application selects and injects; the **domain** runs the capability through the
runtime; the **provider** is swappable without touching the app. Knowledge Studio is
the reference consumer (`products/knowledge-studio/src/{platform,index}.ts`).

## 4. Before you add a NEW capability kind

If you're tempted to add a whole new capability family (media, publishing, routing,
…), check the roadmap §4 first: build it only when a real application demonstrates the
need, and record the **promotion trigger** you are satisfying. Evidence first
(ADR-0012 / ADR-0013).
