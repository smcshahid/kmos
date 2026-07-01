# ADR 0015 — Podcast Studio and the Content Processing Spine (KCSI-02)

## Status

**Accepted** — executed 2026-07-01 (WP1–WP8 complete; Podcast Studio V1 shipped; full
suite 320 pass/0 fail, fitness clean, conformance COMPLIANT; `@kmos/content-projections`
extracted and both flagship apps refactored onto it). Close-out + capability assessment +
final recommendation: [`engineering/review/21-KCSI-02-CLOSEOUT.md`](../../engineering/review/21-KCSI-02-CLOSEOUT.md).
The second flagship application initiative, executing the KEAI-01 Option B recommendation
([ADR-0014](0014-ecosystem-architecture-and-constitution-keai-01.md)).
Consistent with [ADR-0012](0012-architecture-freeze-and-application-driven-evolution.md)
(application-driven evolution), [ADR-0013](0013-provider-capability-extraction-kcsi-01.md)
(KCSI-01), and the [Ecosystem Constitution](../ecosystem/ECOSYSTEM-CONSTITUTION.md).
Plan: `engineering/KCSI-02-PODCAST-STUDIO-PLAN.md`.

## Context

KEAI-01 recommended (Option B) building one application-bearing capability initiative
before broad app-building, to promote the evidenced capability spine through a real second
consumer. Podcast Studio is that application. Knowledge Studio (consumer #1) already
contains pure, app-local projections (transcript parsing, chapter detection, evidence
grounding, packaging) and consumes KCSI-01 providers. Podcast Studio needs the *identical*
projections plus new audio/media/acquisition work — making it the concrete second consumer
that lets these capabilities be extracted with real evidence.

## Decision

1. **Build Podcast Studio as a complete product** (`products/podcast-studio`): a thin
   application over KMOS that composes the `@kmos/sdk` substrate, injects `@kmos/providers`
   adapters, orchestrates its journeys via the deterministic Workflow Service, and produces
   verifiable knowledge (transcript, chapters, summaries, concepts, evidence, quotes, clips,
   reels, subtitles, translations, search, downloadable package) with calm, honest UX,
   persistence, recovery, collections, and favorites.
2. **Let the application reveal capabilities.** Candidate capabilities (acquisition, audio/
   media processing, subtitles, translation, summarization, moment detection, packaging,
   and the shared projections) are **hypotheses**, evaluated against the Article II tests
   and extracted **only after Podcast Studio proves them** — build first, extract second.
3. **Extract with discipline.** Each extraction refactors *both* Knowledge Studio and
   Podcast Studio onto the shared capability, proves behavior unchanged, and records a
   roadmap promotion rationale + future consumers + trigger in the same change. No
   registries/discovery/routing frameworks; refine `withFallback` (quality-tier +
   resilience) only where proven.
4. **Offline-honest, Olares-real.** With no providers wired, the app degrades honestly and
   is fully testable offline (paste-a-transcript path); real providers (Speaches, Ollama,
   yt-dlp, ffmpeg) wire in via env on Olares. No kernel/constitution change.
5. **Expand the SDK only where proven**, and never with business logic or provider
   knowledge (SDK Strategy). App-tier helpers (persistence/recovery, provider-wiring) that
   would otherwise sit illegally in `@kmos/sdk` go to an application-tier `@kmos/app-kit`.

## Consequences

- A second daily-usable product exists, and the capability spine grows from real
  second-consumer evidence — exactly the ecosystem's intended growth mechanism.
- Knowledge Studio and Podcast Studio become (or stay) thin; shared projections remove
  duplication — the platform is simpler after than before.
- The KCSI-02 Capability Assessment (WP8) answers, with evidence, whether the capability
  layer is now mature enough to make application development the primary focus.
- Every capability decision is recorded (rationale/trigger); nothing is built speculatively.

## Alternatives considered

- **Migrate Media Pipeline / AIMPOS.** Rejected (and out of scope): extract behavior, not
  code; those are architectural references only.
- **Extract the candidate capabilities up front, then build the app.** Rejected: violates
  build-first-extract-second and risks contracts that don't fit the real app.
- **Build Podcast Studio without extracting anything.** Rejected: it would leave the
  proven spine duplicated across two apps — the initiative's whole point is disciplined
  extraction on second-consumer evidence.

## References

- `engineering/KCSI-02-PODCAST-STUDIO-PLAN.md`; `documentation/ecosystem/` (constitution,
  inventory, roadmap §4a); ADR-0013 (KCSI-01), ADR-0014 (KEAI-01 / Option B).
- Reference-only evidence (not migrated): Media Pipeline/MPP, AIMPOS, olares-one.
