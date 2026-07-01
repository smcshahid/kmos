# ADR-KS-0002 — Language domain accepts an injected extraction capability

Status: Accepted · Date: 2026-07-01 · Scope: `domains/language` (platform) + Knowledge Studio

## Context

Knowledge Studio's daily-driver experience needs **richer concepts** than the deterministic
reference extractor (capitalized-word heuristic) produces. The right implementation is an
LLM-backed extractor (Ollama on the user's Olares), kept **provider-independent** behind the
KMOS `KnowledgeExtraction` capability contract (a standing KMOS principle, and ADR-KS-0001 §4).

But the `LanguageDomainService` **hard-coded** its extraction capability in `setup()`:

```ts
this.extractionCapabilityId = await this.register(knowledgeExtraction as ReferenceCapability);
```

So there was no way for an application to supply a production extraction implementation
without forking the domain or bypassing it — which would violate "business work runs inside
capabilities" (KMOS-9999 §9). This is a genuine platform limitation surfaced by real product
experience — exactly the case the Architecture Freeze (ADR-0012) says should drive evolution.
The kernel/constitution/catalogs are frozen; **`domains/language` is application-layer and
may evolve.**

## Decision

Add an **optional, backward-compatible** injection point to `LanguageDomainService`:

```ts
export interface LanguageDomainOptions {
  // …
  /** Optional override for the concept-extraction capability. Defaults to the
   *  deterministic reference extractor. */
  readonly extraction?: ReferenceCapability;
}
```

The domain uses `opts.extraction ?? knowledgeExtraction` when registering. Nothing else
changes: correction and translation still use the reference capabilities; the workflow,
runtime, contract, and output shape (`{concepts:[{canonicalName,definition}]}`) are identical.
Default behavior is unchanged, so every existing caller and test is unaffected.

Knowledge Studio supplies an **Ollama-backed** extraction capability
(`createOllamaExtraction`, `products/knowledge-studio/src/ollama-extraction.ts`) when
`OLLAMA_URL` is set, threaded through its composition root
(`CreateStudioPlatformOptions.extraction`). The adapter **falls back to the reference
extractor on any failure** (Ollama down, timeout, malformed JSON, empty result), so
processing always yields useful concepts.

## Consequences

- **Provider independence is real, not aspirational.** Any LLM adapter conforming to the
  contract can be injected; the platform is not coupled to Ollama (the HTTP shape lives in
  the app adapter, not the domain).
- **No breakage.** Backward-compatible default; the whole existing test suite passes
  unchanged.
- **Honest degradation.** A flaky LLM never breaks processing — it degrades to the reference
  extractor, mirroring the product's overall honesty stance.
- **Scope discipline.** Only extraction is injectable for now (the proven product need).
  Correction/translation injection can follow the same pattern if a real need appears.
- **Governance.** This modifies a domain, not the frozen kernel; recorded here per the
  application-driven-evolution policy (ADR-0012). Tests: `products/knowledge-studio/test/
  ollama.test.ts` (injection through the pipeline + both fallback paths).
