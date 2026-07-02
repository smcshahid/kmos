# AI Provider Architecture & Configuration

_The authoritative guide to provider independence in KMOS._ How capabilities stay stable
while providers (local and cloud) come and go, and how to switch providers by
**configuration, not code**. Established by KCSI-01 (`@kmos/providers`, `withFallback`) and
made configurable by **ESRI-01 / [ADR-0016](adr/0016-provider-configuration-and-operational-readiness-esri-01.md)**.

> **Principle (Ecosystem Constitution Art. V):** callers express intent (a capability),
> never an engine. A factory selects the provider from config; fallback is *within* a
> capability, never across. There is **no** provider registry or orchestration framework —
> only adapters + a small config model.

## 1. The three layers

```
Application            reads generic config, injects a capability — NAMES NO PROVIDER
   ↓
Capability contract    the stable interface (e.g. KnowledgeExtraction: Transcript → Concept)
   ↓
Provider adapter       a concrete engine behind the contract (Ollama, OpenAI-compatible, HTTP ASR)
```

When the provider changes, only the **adapter + config** change. The contract — and every
application above it — does not.

## 2. Capabilities and their providers

| Capability | Contract | Providers today | Reachable by config/adapter |
|---|---|---|---|
| **Knowledge extraction** | `Transcript → Concept` | reference · **Ollama** · **OpenAI-compatible** | OpenAI, Azure OpenAI, Groq, DeepSeek, OpenRouter, Mistral, Together (all via the OpenAI-compatible adapter); Gemini / Claude / Bedrock native = a new adapter (§6) |
| **Speech / transcription** | `audioRef → Transcript` (HTTP ASR) | HTTP endpoint (**Speaches / Whisper**) | Azure Speech, Deepgram, any ASR that speaks the tiny HTTP contract, or a new adapter |
| **Translation** | `text, lang → text` | reference only | OpenAI-compatible / Gemini / Azure Translator / DeepL = a new adapter (§6) |

**Knowledge extraction is the worked proof:** two real adapters (Ollama, OpenAI-compatible)
selected by config. Speech is already provider-agnostic (the endpoint *is* the provider).
Translation has one (reference) — its extension point is documented in §6.

## 3. The configuration model

`KnowledgeExtractionConfig` (`@kmos/providers`):

| Field | Meaning |
|---|---|
| `provider` | `reference` \| `ollama` \| `openai-compatible` |
| `baseUrl` | endpoint (Ollama root, or the OpenAI-compatible base incl. version path) |
| `model` | model / deployment name |
| `apiKey` | secret (resolved from a secret reference / env — never hardcoded) |
| `maxConcepts`, `timeoutMs`, `headers` | tuning + provider-specific headers (e.g. Azure) |

`createKnowledgeExtractionFromConfig(cfg)` returns the adapter (composed with fallback to
the reference), or `undefined` for `reference` (the domain then uses its built-in reference).
`extractionConfigFromEnv()` maps environment → config.

## 4. Environment variables & profiles

| Variable | Effect |
|---|---|
| `KMOS_LLM_PROVIDER` | `reference` \| `ollama` \| `openai-compatible` |
| `KMOS_LLM_BASE_URL` | endpoint (e.g. `http://ollama:11434`, `https://api.openai.com/v1`, `https://api.groq.com/openai/v1`) |
| `KMOS_LLM_MODEL` | model / deployment (e.g. `llama3.1`, `gpt-4o-mini`, `deepseek-chat`) |
| `KMOS_LLM_API_KEY` | secret (cloud providers) |
| `KMOS_LLM_MAX_CONCEPTS`, `KMOS_LLM_TIMEOUT_MS` | tuning |
| `OLLAMA_URL` (+ `OLLAMA_MODEL`) | legacy shortcut → the `ollama` provider (still supported) |
| `KS_CAPTION_ENDPOINT` / `PODCAST_TRANSCRIBE_ENDPOINT` | Speech/ASR endpoint |

**Profiles** are just env sets (deployment values / Olares Studio):

- **Local-only:** `KMOS_LLM_PROVIDER=ollama`, `KMOS_LLM_BASE_URL=http://ollama.ollamaserver-shared:11434`.
- **Cloud-only:** `KMOS_LLM_PROVIDER=openai-compatible`, `KMOS_LLM_BASE_URL=https://api.openai.com/v1`, `KMOS_LLM_API_KEY=secret://…`.
- **Offline / reference:** unset (or `KMOS_LLM_PROVIDER=reference`) — deterministic, no network.
- **Hybrid / fallback:** set a real provider; the adapter already **falls back to the
  reference** on any error/empty output (graceful degradation). Provider→provider chains
  compose via `withFallback(a, withFallback(b, reference))` when a real need appears.

**Secrets:** API keys are secrets — inject at install (Olares Studio / K8s Secret / env),
never in git or images. Use `secret://…` references where the Configuration Service resolves
them.

**Quality / cost tiers:** choose by `model` (and provider) — a small local model for
draft/cheap, a larger cloud model for max quality. Tiering beyond model choice is added only
when an application needs runtime multi-provider selection (it does not today).

## 5. Switching providers (the proof)

Switching Ollama → OpenAI/Azure/Groq/DeepSeek/… is **configuration only** — no application
change:

```bash
# Local (Ollama)
KMOS_LLM_PROVIDER=ollama            KMOS_LLM_BASE_URL=http://ollama:11434       KMOS_LLM_MODEL=llama3.1
# OpenAI
KMOS_LLM_PROVIDER=openai-compatible KMOS_LLM_BASE_URL=https://api.openai.com/v1 KMOS_LLM_MODEL=gpt-4o-mini KMOS_LLM_API_KEY=sk-…
# Groq / DeepSeek / OpenRouter / Mistral / Together — same, different BASE_URL + MODEL + KEY
# Azure OpenAI — BASE_URL=https://<res>.openai.azure.com/openai/deployments/<dep>  + headers {'api-key': …}
```

Verified by tests: `capabilities/providers/test/provider-config.test.ts` (config-driven
selection, end-to-end via factory, env precedence). Both flagship apps read this config and
name no provider (`products/*/src/index.ts`).

## 6. Adding a new provider (extension point)

Adding a provider is an **adapter + config** exercise, never an application rewrite:

1. **If it speaks the OpenAI `/chat/completions` API** (OpenAI, Azure, Groq, DeepSeek,
   OpenRouter, Mistral, Together): **nothing to build** — set `provider=openai-compatible` +
   `baseUrl` + `model` + `apiKey` (+ `headers` for Azure).
2. **If it has a native API** (Gemini, Anthropic Claude, AWS Bedrock, Cohere; DeepL/Azure
   Translator for translation; Azure Speech/Deepgram for ASR): add one adapter in
   `@kmos/providers` behind the existing capability contract (mirror `openai-compatible.ts`),
   add its `provider` value to the config factory, and unit-test the success + fallback paths.
   **No app changes** — the apps already inject whatever the config factory returns.
3. **Fallback + resilience** belong to the capability layer (`withFallback`), not the app.
4. **Never** import a provider SDK into an application.

See `capabilities/providers/src/knowledge-extraction/openai-compatible.ts` as the template
and the [Capability Development Guide](CAPABILITY-DEVELOPMENT-GUIDE.md) for the contract rules.
