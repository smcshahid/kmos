# ADR 0016 — Provider configuration model & operational readiness (ESRI-01)

## Status

**Accepted-plan** — the final stabilization initiative before application-focused
development. Consistent with [ADR-0012](0012-architecture-freeze-and-application-driven-evolution.md)
(application-driven evolution), [ADR-0013](0013-provider-capability-extraction-kcsi-01.md)
(KCSI-01 providers), [ADR-0014](0014-ecosystem-architecture-and-constitution-keai-01.md)
(Ecosystem Constitution), and the SDK Strategy. Plan:
`engineering/ESRI-01-ECOSYSTEM-STABILIZATION-PLAN.md`.

## Context

KMOS, Knowledge Studio, Podcast Studio, and the capability layer are complete. Before making
applications the primary investment, the ecosystem must be operationally complete and
reproducible, and **provider independence must be real and demonstrated**, not aspirational.
Today the knowledge-extraction capability has one real adapter (Ollama) selected by a
one-line `if (env)` in each app. The ecosystem must prove that switching providers — local
(Ollama/Speaches) or cloud (OpenAI, Azure OpenAI, Claude, Gemini, Bedrock, Groq, DeepSeek,
OpenRouter, Mistral, Cohere) — is a **configuration + adapter** exercise, never an
application rewrite. The brief and the Ecosystem Constitution (Art. IV/V) explicitly forbid a
provider registry / orchestration framework.

## Decision

1. **A small provider configuration model, not a framework.** Add a `ProviderConfig`
   (`provider`, `baseUrl`, `model`, `apiKey`, `timeoutMs`, tiers) and a factory
   `createKnowledgeExtractionFromConfig(config)` that selects the adapter and composes it with
   `withFallback` to the deterministic reference (graceful degradation / fallback chains).
   `extractionConfigFromEnv()` maps environment variables → config. This is a factory + config,
   with no registry, discovery, or routing middleware.

2. **A second real adapter proves interchangeability.** Add an `openai-compatible`
   knowledge-extraction adapter (standard `/chat/completions` API) covering OpenAI, Azure
   OpenAI, Groq, DeepSeek, OpenRouter, Mistral, Together, and any OpenAI-compatible endpoint
   via `baseUrl`+`model`+`apiKey`. Adding it required **no application change** — the proof.

3. **Applications are provider-unaware.** Knowledge Studio and Podcast Studio wire the config
   factory (env-driven), not a named provider. Switching Ollama → any cloud provider is a
   config change; both apps' behavior is unchanged and their tests stay green.

4. **Extension points documented for the rest.** Speech is already provider-agnostic via the
   HTTP ASR endpoint contract (any Speaches/Whisper/Azure/Deepgram-style endpoint = config).
   Translation has a reference capability; adding a real provider is the same adapter+config
   exercise, evidenced by the knowledge-extraction proof — built when an app pulls it.

5. **Operational readiness is documented, consolidated, not duplicated.** One authoritative
   Ecosystem Playbook, an AI Provider Architecture & Configuration doc, a Packaging Standard, a
   Release Readiness Checklist, and a Manual Testing Philosophy; existing DEPLOYMENT/OLARES/
   OPERATIONS/RELEASE-LIFECYCLE docs are cross-referenced. **Manual testing is the final step,
   only after all automated verification is green.**

## Consequences

- Provider independence is a proven, tested fact: switching AI providers is configuration.
- Future applications inherit a complete operational standard (playbook, packaging, checklist)
  and a provider-unaware pattern.
- No framework debt: the config model is ~one file + adapters; the capability contract remains
  the stable interface.
- Human validation focuses on product experience, not engineering correctness.

## Alternatives considered

- **A provider registry / routing engine.** Rejected — forbidden by the brief and Constitution
  Art. IV/V; no application needs runtime multi-provider selection beyond primary+fallback.
- **Per-cloud-provider adapters up front (OpenAI, Azure, Groq, … each).** Rejected — one
  OpenAI-compatible adapter covers most via config; provider-specific adapters (Gemini, Claude,
  Bedrock native APIs) are added when a real need appears (extension point documented).
- **Build translation/speech cloud adapters now.** Rejected — speculative; documented as
  extension points, pulled by real app need.

## References

- `engineering/ESRI-01-ECOSYSTEM-STABILIZATION-PLAN.md`; `documentation/PROVIDER-GUIDE.md`
  (AI Provider Architecture & Configuration); `documentation/ecosystem/` (Playbook, Constitution).
- ADR-0013 (`@kmos/providers`, `withFallback`), ADR-0014 (Ecosystem Constitution Art. V).
