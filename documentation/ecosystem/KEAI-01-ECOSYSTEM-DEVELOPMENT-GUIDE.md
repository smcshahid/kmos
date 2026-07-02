# Ecosystem Development Guide

_KEAI-01 · 2026-07-01._ The standard for building every future KMOS application. If you
are starting a new app (Podcast Studio, Meeting Studio, Research Studio, Publishing
Studio, a Media Pipeline), read this and the [Ecosystem
Constitution](ECOSYSTEM-CONSTITUTION.md) first.

## 1. How to build an application (the golden path)

1. **Start thin.** Scaffold the deployable; compose the platform substrate via
   `@kmos/sdk` (`createPlatformRuntimeFromEnv`). You now have knowledge, assets,
   governance, events, workflow, search, identity, config — with boot recovery — for free.
2. **Model your journey, not your infrastructure.** Write your app's orchestration as
   domain services that *coordinate capabilities via the Workflow Service*. No business
   computation in the app; no provider SDKs.
3. **Inject providers, don't import them.** For each capability you need, inject an
   adapter from `@kmos/providers` (or a reference capability). Selection is your one-line
   config choice (`use X if configured, else reference`).
4. **Keep canonical meaning in KMOS.** Concepts, assets, provenance, lineage, trust,
   search — all live in the platform. Your app assembles *read models* (views), it does
   not own the truth.
5. **Add your surface.** UI/API is the last, thinnest layer. It holds no business rules.
6. **Verify on the real target.** Local tests are necessary; Olares (or your production
   target) E2E is authoritative.

**Definition of done:** conformance profiles COMPLIANT · fitness 0 violations · tests
green (unit local + E2E on target) · docs + ADR(s) updated · roadmap updated if a
capability changed · Conventional Commits · evidence archived.

## 2. How capabilities emerge (and when to extract)

Capabilities are **discovered inside applications**, not designed in advance.

- **Build it in your app first.** The first time you need transcription, chunking,
  acquisition — implement it in the app, behind a small contract, with a reference
  fallback.
- **Extract on the second consumer.** When a *second* real application (or a concretely
  planned one) needs the same work, and it satisfies the Article II tests (contract-
  stable, provider-replaceable, cross-app, kernel-only, deterministic-core), extract it
  into `@kmos/providers` / a domain, refactor both consumers onto it, and prove behavior
  is unchanged.
- **Record rationale + trigger.** Update the [Capability Evolution
  Roadmap](../CAPABILITY-EVOLUTION-ROADMAP.md): a promotion *rationale* for what you
  extracted, a promotion *trigger* for what you deferred.

### When NOT to extract

- Only one app needs it → keep it in the app.
- The contract is still moving → let it settle in the app.
- The reuse is imagined, not implemented → defer, and write the trigger.
- You're tempted to build a registry/discovery/routing framework → **stop**; no real app
  has demonstrated it cannot proceed without one.

## 3. Provider independence (how to do it right)

- **Express intent, not engines.** Consumers request a capability (+ quality tier where
  it matters). They never name Ollama/Whisper/yt-dlp/ffmpeg.
- **One adapter per provider, behind the contract.** HTTP via the platform's `fetch`;
  driver imports (if unavoidable) confined to `infrastructure/`.
- **Fallback within the capability.** Use `withFallback` (or its quality-tier successor):
  degrade to another provider or the reference on error/unusable output. Never
  cross-substitute capabilities. Fail closed and loud when truly unavailable.
- **Be resilient.** Timeout, bounded retry with backoff, idempotency, and a health signal
  on every provider call.
- **Attribute the result.** Record provider + version so lineage/trust stay explainable.

## 4. Testing

- **Deterministic cores are unit-tested offline** (inject fakes for all I/O).
- **Adapters are tested against a local double** (throwaway HTTP server / fake client),
  asserting both the success and every degradation path.
- **Behavior parity on extraction** — when you move logic into a shared capability, carry
  the consuming app's tests and prove identical outputs.
- **E2E on the real target** for the journey; verification there is authoritative.
- **Conformance + fitness** run in CI on every change.

## 5. Governance

- **ADR every architectural decision**; update the ADR index + decisions log in the same
  change (definition-of-done).
- **AI proposes, governance disposes** for anything published/distributed; record
  disclosure/consent before generation where relevant.
- **Attribution + explainability** are on by default; don't add write paths that bypass
  them.
- **Independent review** (architecture, DX, maintainability) before declaring a capability
  shared; be honest about debt.

## 6. Documentation

- One canonical document per topic; new lessons edit the canonical doc, not a new file.
- Every capability cites the application evidence that justified it.
- Keep a **failure catalog** (one guardrail per root-caused failure) and an **executable
  rebuild runbook** for the deployment.
- Track three versions independently: application/code, configuration/profile,
  output/contract.

## 7. Repository standards

- Conventional Commits; logical, reviewable history; feature branches → PR (never commit
  to the default branch directly).
- Immutable images; secrets injected at install (never in git/images).
- CI: lint + typecheck + fitness + tests + conformance (+ real-DB/target job where
  applicable).
- Commit/push only when the owner asks; verify on the real estate before claiming done.

## 8. Architecture review & promotion process

1. **Propose** — plan + ADR citing the real application evidence.
2. **Review** — architecture / DX / maintainability challenge; check Article II tests and
   fitness legality of the proposed home.
3. **Extract** — small, evidence-cited work packages; behavior-preserving; each green.
4. **Record** — roadmap rationale (extracted) or trigger (deferred).
5. **Close out** — independent review + honest proven/deferred assessment.

This is exactly the cadence KCSI-01 followed; reuse it for every capability initiative.
