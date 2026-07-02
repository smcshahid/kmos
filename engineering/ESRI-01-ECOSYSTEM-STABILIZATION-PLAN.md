# ESRI-01 — Final Ecosystem Stabilization & Operational Readiness

_Plan · 2026-07-01._ The stabilization phase before application-focused development becomes
the primary investment. Governed by the
[Ecosystem Constitution](../documentation/ecosystem/ECOSYSTEM-CONSTITUTION.md) and
[ADR-0016](../documentation/adr/0016-provider-configuration-and-operational-readiness-esri-01.md).

## 1. Mission

Leave the repository operationally complete and reproducible: every future application
follows the same conventions, deployments are reproducible, **AI providers are configurable
(switch by config, not code)**, Olares deployment is repeatable, and manual testing is
requested only after automated verification is exhausted. **No new product functionality.**

## 2. Guardrails (what this is NOT)

- **No registry / orchestration framework** (the brief and Ecosystem Constitution Art. IV
  forbid it). Provider independence comes from adapters + a small config model, not middleware.
- **No speculative capabilities.** Prove provider-interchange on the capability two apps
  actually use (knowledge extraction); document the extension point for the rest.
- **No documentation sprawl.** Consolidate to one authoritative doc per topic; the existing
  operational docs (DEPLOYMENT/OLARES/OPERATIONS/RELEASE-LIFECYCLE/…) are referenced, not
  duplicated.

## 3. The concrete implementation (provider independence — proven)

The core technical claim of this mission is that **applications never change when providers
change.** We prove it, not just assert it:

- **Second adapter.** Add an `openai-compatible` knowledge-extraction adapter (speaks the
  standard `/chat/completions` API) alongside the existing Ollama adapter. One adapter covers
  OpenAI, Azure OpenAI, Groq, DeepSeek, OpenRouter, Mistral, Together, and any OpenAI-
  compatible endpoint — via `baseUrl` + `model` + `apiKey`.
- **Config model + factory.** `createKnowledgeExtractionFromConfig(config)` selects the
  provider from configuration and composes it with `withFallback` to the deterministic
  reference. `extractionConfigFromEnv()` maps env → config. Switching Ollama → OpenAI/Azure/
  Groq/… is a **config change**, not a code change.
- **Apps read generic config.** Knowledge Studio + Podcast Studio wire the config factory,
  not a named provider — proving the application is provider-unaware.
- **Extension points documented** for Speech (already provider-agnostic via the HTTP ASR
  endpoint contract) and Translation (reference only today) — adding a provider there is the
  same adapter+config exercise, evidenced by the knowledge-extraction proof.

## 4. Work packages (each: code/docs → tests → green → Conventional Commit)

- **WP0 — Propose.** This plan + ADR-0016. _(this deliverable)_
- **WP1 — Provider config + second adapter.** `openai-compatible` adapter, `ProviderConfig`,
  `createKnowledgeExtractionFromConfig`, `extractionConfigFromEnv`; fallback chains; tests
  proving multi-provider selection by config + graceful degradation. (Deliverables 3, 4,
  additional requirement.)
- **WP2 — Apps consume config.** Knowledge Studio + Podcast Studio wire the config factory
  (env-driven, provider-unaware); both suites stay green (behavior identical). Prove switching
  = env only.
- **WP3 — Provider docs.** Rewrite `PROVIDER-GUIDE.md` into the authoritative **AI Provider
  Architecture & Configuration** doc: adapter pattern, config model, provider matrix
  (local/cloud), profiles, secrets, fallback/quality/cost tiers, extension points.
- **WP4 — Ecosystem Playbook.** One operational handbook: build-an-app, use/extract
  capabilities, repo standards, testing, deployment, review, release, Olares, provider
  integration, manual validation. The onboarding doc for future engineers. (Deliverable 2.)
- **WP5 — Release + Olares + Packaging standards.** Reproducible Docker/release workflow doc
  (consolidating existing + lessons), Olares operations runbook cross-reference, and a
  **Packaging Standard** generalized from Knowledge Studio + Podcast Studio. (Deliverables 5,
  6, 7.)
- **WP6 — Readiness gates.** **Release Readiness Checklist** + **Manual Testing Philosophy**
  (human validation is the final step, only after all automated gates). (Deliverables 8, 10.)
- **WP7 — Cleanup, indexes, governance, assessment.** Documentation review (one authoritative
  doc per topic; fix indexes/cross-refs), repository governance review, templates check,
  ADR-0016 → executed, roadmap update, and the **Final Assessment** answering the 7 questions.
  (Deliverables 1, 9, 11, 12.)

## 5. Success criteria

1. Provider independence is real and proven: a second adapter exists; switching provider is
   config-only; both apps are provider-unaware; the extension point is documented + tested.
2. One authoritative operational handbook (Playbook) + Release Readiness Checklist + Manual
   Testing Philosophy exist; docs are consolidated with correct indexes/cross-refs.
3. Docker/release + Olares deployment are documented as reproducible/repeatable (existing +
   lessons captured).
4. Full suite + fitness + conformance green; repository governance reflects current state.
5. A clear, evidence-backed answer to the 7 final questions.

## 6. Verification-first (manual testing is last)

All engineering verification (tests, fitness, CI, conformance, container/package checks,
independent review) is completed and green **before** any manual validation is requested —
this mission codifies that as the standing rule (WP6).
