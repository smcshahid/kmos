# @kmos/content-projections

Pure, dependency-free **content projections** over a transcript, shared by KMOS
applications:

- **transcript** — `parseTranscript` (WebVTT/SRT cues, leading timestamps, or estimated
  prose), `parseTimecode`/`formatTimecode`, `splitSentences`, `segmentsToText`,
  `totalDuration`.
- **chapters** — `detectChapters` (natural-break outline).
- **evidence** — `findEvidence` (locate the exact grounding passage; never fabricated).

## Why this exists (KCSI-02)

These were app-local in Knowledge Studio, then re-implemented **byte-for-byte** in
Podcast Studio. Two independent consumers of identical logic is the evidence that made
this a shared capability (Ecosystem Constitution Art. IV). Both apps now import it; the
duplication is gone. Promotion rationale + trigger: see
[`documentation/CAPABILITY-EVOLUTION-ROADMAP.md`](../../documentation/CAPABILITY-EVOLUTION-ROADMAP.md) §3.

## Principles

- **Pure & deterministic** — no KMOS, no I/O, no wall-clock; safe to unit-test offline.
- **Kernel-only layer** — zero dependencies; sits at the capabilities layer, consumed by
  applications.
- **Honest** — estimated timing is flagged (`timedExactly: false`); absent evidence
  returns nothing rather than a fabricated quote.
