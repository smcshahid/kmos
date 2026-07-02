# @kmos/providers

Real **provider adapters** behind existing KMOS capability contracts. Applications
inject these; they never import a provider SDK or know which provider runs the work.

Extracted from Knowledge Studio under **KCSI-01** (evidence-first): each adapter cites
the application code that proved the need in
[`documentation/CAPABILITY-EVOLUTION-ROADMAP.md`](../../documentation/CAPABILITY-EVOLUTION-ROADMAP.md) §3.

## Adapters

| Adapter | Contract | Provider shape | Graceful degradation |
|---|---|---|---|
| `createOllamaExtraction` | `KnowledgeExtraction` (`@kmos/reference-capabilities`) | HTTP → Ollama `/api/chat` | `withFallback` → deterministic reference extractor on error / empty output |
| `makeHttpCaptionFetcher` | caption/ASR acquisition (transcription) | HTTP → operator-provided endpoint (yt-dlp/Whisper/Speaches) | returns `undefined` → honest "needs infra" upstream |

## Principles

- **Provider-independent by contract.** Each adapter satisfies an existing reference
  contract; swapping providers changes only the implementation.
- **No new registry / discovery / routing.** Selection is the application's one-line
  choice; fallback is the shared `withFallback` primitive (KMOS-0120 §3, ADR-0013).
- **Kernel/contract-only dependencies.** Depends on `@kmos/reference-capabilities`
  (same layer) and the kernel — never a platform service or an upper layer.
- Uses the global `fetch`; no provider npm SDKs.
