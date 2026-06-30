# KMOS Capability Development Guide

_How to write, register, run, version, and certify a KMOS capability — example-driven,
copy-pasteable, and grounded in the source._

_Grounded in: `capabilities/reference-capabilities/src/*` (the descriptor +
`CapabilityHandler` pattern), `platform/capability-registry/src/*` (catalog,
versioning, certification, discovery, dependency cycles), `platform/capability-runtime/src/*`
(execution, isolation, observability, configuration), and `domains/media/src/*`
(how a domain composes a capability and runs it through a workflow)._

_Last updated: 2026-06-30 · Audience: capability authors, domain engineers._

---

## 0. The constitutional rule (read this first)

**Business logic lives ONLY in capabilities.** This is non-negotiable (KMOS-9999 §10,
KMOS-0120):

- **Capabilities compute.** They are the only layer that performs business work.
- **Domains compose.** They wire capabilities together and contain no business logic.
- **The Workflow Service and the Capability Runtime coordinate; they never compute.**
- **Applications are thin facades.**

A capability is a **permanent business ability** with a stable identity that outlives
any single implementation (KMOS-0120 §3). The technology behind it — a hand-written
function, an AI model, an external service — may be replaced; the **business contract is
preserved**.

---

## 1. What a capability is, structurally

A capability is two things:

1. A **`CapabilityHandler`** — the executable, exposing `invoke` + `health`.
2. A **`CapabilityDescriptor`** — registration metadata: name, owner domain, version,
   inputs, outputs, and the business contract.

By convention (see the reference capabilities) these are bundled in a
**`ReferenceCapability`**: `{ descriptor, create() }`, where `create()` returns a fresh
handler.

### 1.1 Dependency rule — capabilities depend ONLY on the kernel

A capability **must import only `@kmos/canonical-kernel`** (and its own files). It must
**not** import the Capability Runtime, the Registry, the Workflow Service, or any other
platform service. This keeps a capability free of runtime coupling so it can outlive its
runtime (KMOS-0120 §3). The architecture-fitness checks (`npm run fitness`) enforce this
dependency direction.

To stay decoupled, the reference capabilities declare their **own** `CapabilityHandler`
type in `capabilities/reference-capabilities/src/contract.ts` — structurally identical
to the runtime's `CapabilityHandler` port — so no runtime import is needed:

```ts
// capabilities/reference-capabilities/src/contract.ts (excerpt)
export type HealthState =
  | 'Unknown' | 'Starting' | 'Ready' | 'Busy' | 'Degraded' | 'Unavailable';

export interface InvocationContext {
  readonly capabilityId?: string;
  readonly version?: string;
  readonly correlationId?: string;
  readonly organizationId?: string;
  readonly configuration?: Readonly<Record<string, unknown>>;
}

export interface CapabilityHandler<I = unknown, O = unknown> {
  invoke(input: I, context: InvocationContext): Promise<O>;
  health(): HealthState;
}

export interface CapabilityDescriptor {
  readonly name: string;
  readonly ownerDomain: string;
  readonly businessPurpose: string;
  readonly version: string;                       // semver
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly contract: {
    readonly acceptedObjects: readonly string[];
    readonly producedObjects: readonly string[];
    readonly consumedEvents: readonly string[];
    readonly publishedEvents: readonly string[];
  };
}

export interface ReferenceCapability<I = unknown, O = unknown> {
  readonly descriptor: CapabilityDescriptor;
  create(): CapabilityHandler<I, O>;
}
```

> Because the structures match, the same handler value satisfies the runtime's
> `CapabilityHandler` port (`platform/capability-runtime/src/domain/ports.ts`) when it is
> registered for execution — without the capability ever importing the runtime.

---

## 2. The `CapabilityHandler` contract (`invoke` / `health`)

```ts
interface CapabilityHandler<I, O> {
  invoke(input: I, context: InvocationContext): Promise<O>;   // do the business work
  health(): HealthState;                                       // operational readiness
}
```

- **`invoke`** is always `async` and returns the capability's output. It receives the
  typed `input` plus an `InvocationContext` carrying correlation/identity metadata and
  externally-resolved `configuration`. It must **not** reach into platform infrastructure
  itself (no direct event publishing, no store access) — the runtime surrounds the call
  with observability and isolation (§4).
- **`health()`** reports the current operational state. The runtime **refuses to invoke**
  a handler whose health is not invocable (e.g. `Unavailable`, `Starting`) and treats a
  throwing `health()` as `Unavailable` — so keep it cheap and total.

### 2.1 Externalized configuration (KMOS-0160 §9)

Capabilities **SHALL NOT bake in business configuration**. The runtime resolves it via a
`ConfigurationPort` and passes it into `context.configuration`. Read configuration from
the context; never hardcode it.

### 2.2 Determinism

Reference capabilities are deterministic (no clocks, no randomness in the core), which is
what makes replay and certification meaningful. If an implementation must be
non-deterministic (e.g. calls an external model), keep that at the edge and make the
output an evidence artifact reviewed under governance.

---

## 3. A complete, copy-pasteable example

Modeled directly on `capabilities/reference-capabilities/src/transcription.ts`. This is a
single self-contained capability file that depends on nothing but the local contract.

```ts
// capabilities/reference-capabilities/src/sentiment.ts
/** Sentiment Analysis capability (reference/deterministic). KMOS-0004 Language. */
import type { CapabilityHandler, CapabilityDescriptor, ReferenceCapability } from './contract.js';

export interface SentimentInput { readonly text: string; readonly language?: string; }
export interface SentimentOutput {
  readonly label: 'positive' | 'neutral' | 'negative';
  readonly score: number;
  readonly language: string;
}

// 1) The descriptor: identity + business contract used to register the capability.
export const sentimentDescriptor: CapabilityDescriptor = {
  name: 'SentimentAnalysis',
  ownerDomain: 'Language',
  businessPurpose: 'Classify the sentiment of a text',
  version: '1.0.0',
  inputs: ['Transcript'],
  outputs: ['SentimentScore'],
  contract: {
    acceptedObjects: ['Transcript'],
    producedObjects: ['SentimentScore'],
    consumedEvents: ['TranscriptGenerated'],
    publishedEvents: ['SentimentScored'],
  },
};

// 2) The capability: descriptor + a factory that produces a fresh handler.
export const sentiment: ReferenceCapability<SentimentInput, SentimentOutput> = {
  descriptor: sentimentDescriptor,
  create(): CapabilityHandler<SentimentInput, SentimentOutput> {
    return {
      health: () => 'Ready',
      invoke: async (input, context) => {
        // Business logic lives HERE. Read any externalized config from the context;
        // never bake business configuration into the capability.
        const threshold = Number(context.configuration?.['neutralBand'] ?? 0.1);
        const score = scoreText(input.text);            // deterministic core
        const label = score > threshold ? 'positive'
          : score < -threshold ? 'negative' : 'neutral';
        return { label, score, language: input.language ?? 'en' };
      },
    };
  },
};

function scoreText(text: string): number {
  // Deterministic placeholder for a real model: net positive/negative word balance.
  const pos = (text.match(/\b(good|great|excellent|sincere)\b/gi) ?? []).length;
  const neg = (text.match(/\b(bad|poor|terrible|insincere)\b/gi) ?? []).length;
  const total = pos + neg || 1;
  return (pos - neg) / total;
}
```

Export it alongside the others (`capabilities/reference-capabilities/src/index.ts`):

```ts
export * from './sentiment.js';
import { sentiment } from './sentiment.js';

export const referenceCapabilities: readonly ReferenceCapability[] = [
  transcription as ReferenceCapability,
  translation as ReferenceCapability,
  knowledgeExtraction as ReferenceCapability,
  rendering as ReferenceCapability,
  sentiment as ReferenceCapability,   // add it to the bulk-registration list
];
```

Note the spec-correct `.js` import specifiers (NodeNext); the offline dev runner maps
them to `.ts` at run time (`OPERATIONS-GUIDE.md` §3.3).

---

## 4. Registering the capability — Registry then Runtime

There are two distinct platform services and you register with **both** — they have
different jobs (KMOS-0205 vs. KMOS-0210):

- **Capability Registry** (`@kmos/capability-registry`) — the authoritative **catalog of
  business abilities**: register, version, discover, certify, analyse dependencies. It is
  **independent of any runtime**.
- **Capability Runtime** (`@kmos/capability-runtime`) — **runs** the registered ability:
  resolves the active implementation and executes it with isolation, observability, and
  external configuration. It computes nothing of its own; it surrounds the handler.

```ts
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { sentiment } from '@kmos/reference-capabilities';

const d = sentiment.descriptor;

// (a) Catalog the ABILITY in the Registry (its first version + manifest + contract).
const cap = await registry.registerCapability({
  name: d.name,
  ownerDomain: d.ownerDomain,
  businessPurpose: d.businessPurpose,
  version: d.version,
  inputs: [...d.inputs],
  outputs: [...d.outputs],
  contract: {
    acceptedObjects: [...d.contract.acceptedObjects],
    producedObjects: [...d.contract.producedObjects],
    consumedEvents: [...d.contract.consumedEvents],
    publishedEvents: [...d.contract.publishedEvents],
  },
  // dependencies: [otherCapabilityId],            // optional; cycles are rejected
  // securityRequirements: ['language:write'],     // optional
});

// (b) Register + ACTIVATE an implementation in the Runtime for (capabilityId, version).
await runtime.registerImplementation(cap.id, d.version, sentiment.create());
```

`registerCapability` parses the semver, rejects dependency cycles, stores the immutable
manifest, and publishes `ManifestValidated` + `CapabilityRegistered`.
`registerImplementation` activates the handler (latest-wins) and publishes
`CapabilityRuntimeRegistered`. This is exactly the pattern the Media domain uses in
`setup()` (`domains/media/src/media-domain-service.ts`).

---

## 5. Versioning, certification, isolation, lifecycle, discovery

### 5.1 Versioning (KMOS-0120, KMOS-0160 §12)
- A capability has **stable identity** (`cap.id`) across versions; each version has an
  **immutable manifest**. Register a new version with
  `registry.registerVersion(capabilityId, { version: '1.1.0', contract, … })` — registering
  a version that already exists is a `Conflict`.
- `currentVersion` advances to the newest semver automatically.
- In the Runtime, activation is **latest-wins**; `runtime.invoke(capId, input)` resolves
  the active implementation, or you can pin a version when resolving health
  (`runtime.health(capId, version)`).

### 5.2 Certification (KMOS-0205)
Grant a certification level for a specific version:

```ts
await registry.certify(cap.id, '1.0.0', 'Verified', 'GovernanceBoard');
// Levels (ascending): Experimental < Development < Verified < Production < Enterprise < Reference
```

This records an immutable `CapabilityCertification`, sets the capability's lifecycle to
`Certified`, and publishes `CapabilityCertified`. Discovery can then filter by
`minCertification` (§5.5).

### 5.3 Isolation (KMOS-0160 §21)
You do **not** write isolation — the Runtime provides it. Every `invoke` is wrapped in
`try/catch`: a failing capability is contained, never throwing across the boundary;
faults are classified into the kernel `KmosError` taxonomy and surfaced as a
`CapabilityExecutionFailed` event. An unrelated subsequent invocation is unaffected. A
handler that throws an uncategorized error becomes an `Infrastructure` fault; throw a
`KmosError` with a precise `category`/`code` when you want a specific classification.

### 5.4 Lifecycle (KMOS-0205)
Capability lifecycle states: `Proposed → Experimental → Prototype → Verified → Certified
→ Production → Deprecated → Archived`. Retire an ability with
`await registry.deprecate(cap.id)` (publishes `CapabilityDeprecated`).

### 5.5 Discovery (KMOS-0205)
Find capabilities by **business criteria**, not by location:

```ts
const speechToText = registry.discover({
  ownerDomain: 'Language',
  input: 'Transcript',
  output: 'SentimentScore',
  consumesEvent: 'TranscriptGenerated',
  minCertification: 'Verified',
  lifecycle: 'Certified',
});
```

Inspect contracts and dependencies with `registry.getContract(id, version?)`,
`registry.getVersions(id)`, and `registry.getDependencies(id)` (direct + transitive).

---

## 6. How a workflow invokes the capability via the runtime

The Workflow Service never calls the Runtime directly — it delegates through the
**`CapabilityInvoker` port** (KMOS-0204), bound to the Runtime by a small composition
adapter that lives in the domain, `RuntimeCapabilityInvoker`
(`domains/media/src/infrastructure/runtime-invoker.ts`):

```ts
// the adapter the domain wires in (engine stays decoupled from the runtime)
export class RuntimeCapabilityInvoker implements CapabilityInvoker {
  constructor(private readonly runtime: CapabilityRuntimeService) {}
  async invoke(ref, input, ctx) {
    const res = await this.runtime.invoke(ref as CanonicalId, input, {
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    });
    if (!res.success) throw res.error;   // surface the classified KmosError to the engine
    return res.output;                   // opaque to the engine; it never interprets it
  }
}
```

A workflow then references the capability by id in an `activity` step; the engine maps
the input and calls the invoker:

```ts
const def = await workflow.registerWorkflow({
  name: 'language.score', ownerDomain: 'Language', businessPurpose: 'Score sentiment',
  steps: [{ id: 'score', kind: 'activity', capabilityRef: cap.id, input: { text: '$input.text' } }],
});
const exec = await workflow.start(def.id, { text: 'sincere and great' });
const out = exec.body.stepResults['score']?.output as { label: string };
```

See `documentation/WORKFLOW-DEVELOPMENT-GUIDE.md` for the full declarative step model.

---

## 7. Test and run

```bash
npm run fitness        # MUST pass — proves the capability imports only the kernel
npm test               # run the suite (add a test under your package's test/ dir)
npm run demo           # the reference demo exercises capabilities via domains + workflow
```

A capability test asserts the deterministic business output directly:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { sentiment } from '../src/sentiment.js';

test('SentimentAnalysis classifies positive text', async () => {
  const out = await sentiment.create().invoke({ text: 'great and sincere' }, {});
  assert.equal(out.label, 'positive');
});
```

---

## 8. Checklist for a new capability

- [ ] Depends on **`@kmos/canonical-kernel` only** (no runtime/registry/service imports).
- [ ] Exposes a `CapabilityHandler` (`invoke` async, `health()` total + cheap).
- [ ] All **business logic is inside `invoke`**; configuration is read from the context.
- [ ] Has a `CapabilityDescriptor` with semver `version` and a precise business contract.
- [ ] Registered in the **Registry** (`registerCapability` / `registerVersion`) and
      activated in the **Runtime** (`registerImplementation`).
- [ ] Certified to the appropriate level when ready (`registry.certify`).
- [ ] `npm run fitness` and `npm test` green.

---

## 9. References

- **Source:** `capabilities/reference-capabilities/src/contract.ts` +
  `transcription.ts` (the pattern), `platform/capability-registry/src/application/capability-registry-service.ts`
  (register/version/certify/discover/dependencies),
  `platform/capability-runtime/src/application/capability-runtime-service.ts`
  (invoke/isolation/observability/configuration),
  `platform/capability-runtime/src/domain/ports.ts` (the handler + resolver + config
  ports), `domains/media/src/media-domain-service.ts` (composition).
- **Specs:** KMOS-0120 (capability concept + manifest + contract), KMOS-0160 (capability
  engineering: handler, isolation §21, configuration §9, versioning §12, health §14),
  KMOS-0205 (Capability Registry: catalog/version/certify/discover), KMOS-0210
  (Capability Runtime), KMOS-9999 §10 (business logic only in capabilities).
- **Companion docs:** `documentation/WORKFLOW-DEVELOPMENT-GUIDE.md`,
  `documentation/DEVELOPER-GUIDE.md`, `documentation/ARCHITECTURE.md`.
