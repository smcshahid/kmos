# Gap Analysis

_KEAI-01 · 2026-07-01._ Strengths, weaknesses, missing capabilities, over/under-
abstractions, and the four debts (architectural, technical, governance, documentation).
Honest by design.

## 1. Strengths (keep and defend)

- **Constitutional core, machine-enforced.** Frozen kernel, canonical types, import-
  direction fitness, conformance kit. The value ordering is structural, not aspirational.
- **Evidence-first culture, proven.** KCSI-01 extracted only what one app demonstrated,
  measured the result (−9.5% app code), and recorded rationale/trigger. The discipline
  works.
- **Convergent validation.** Four independent systems arrived at the same architecture;
  KMOS is the distilled form. Low risk of fundamental redesign.
- **Governance depth.** ADRs, reviews, acceptance/evidence discipline, Olares-
  authoritative verification — mature across all systems.
- **Provider independence with honest degradation.** Capability-first + `withFallback`;
  applications carry no provider logic.

## 2. Weaknesses (address deliberately)

- **The capability layer is shallow.** Only 3 capabilities extracted (extraction, ASR,
  fallback) + the SDK. The evidenced spine (acquisition, media-processing, translation,
  chunking, subtitles, publishing, preservation) is not yet shared.
- **Only one KMOS-native application exists** (Knowledge Studio). "Cross-application" is
  so far mostly *prospective*; the second consumer (Media Pipeline-on-KMOS) is not built.
- **Persistence realism.** Read models are in-memory behind ports; only the EventLog is
  real-Postgres-validated. Fine for single-node, a gap for scale/HA.
- **No real IdP / secrets backend / tracing** in-environment (documented seams).

## 3. Missing capabilities (evidenced, not yet present)

Ranked by evidence strength × reuse (all from the [Inventory](KEAI-01-CAPABILITY-INVENTORY.md) §C):

1. **Source acquisition** (yt-dlp behind a contract) — highest reuse.
2. **Media processing** (ffmpeg audio/transcode/clip/segment).
3. **Translation** (real provider; contract already exists — cheapest win).
4. **Resilience / idempotency** on adapters (cross-cutting; present gap in KCSI-01).
5. **Publishing / packaging** (export + citation/study-guide).
6. **Chunking / segmentation**, **subtitles**, **moment intelligence** (media cluster).
7. **Storage tiering / preservation** (highest value, highest data-risk).

None should be built speculatively; each is unlocked by a real KMOS consumer.

## 4. Over-abstractions (none built — vigilance required)

KMOS has *avoided* over-abstraction well. The standing temptations to keep refusing:

- A **capability registry / discovery / routing framework** — no app needs it; AIMPOS's
  own evidence warns against generic plugin systems.
- **Multi-provider cost/latency/quality routing** — only one-primary-one-fallback is
  proven; build richer selection only when an app must choose among ≥2 live providers.
- **Premature SDK growth** — domain composition, CLIs, client libs are all evidence-gated.

## 5. Under-abstractions (real, evidenced refinements)

- **Provider selection is hand-wired** (`if (env) X else reference`) in every app — a
  small typed helper is warranted (near-term).
- **Fallback lacks quality tiers + fail-closed semantics** — AIMPOS shows the richer,
  correct pattern; `withFallback` should grow (not be replaced).
- **Adapters lack a shared resilience wrapper** (timeout/retry/backoff/idempotency) —
  every reference system hand-rolls it; it is genuinely cross-cutting.
- **No business-lifecycle event helper** — MPP's explicit lifecycle states are a good
  pattern; defer to a second consumer but record the trigger.

## 6. The four debts

| Debt | Current state | Action |
|---|---|---|
| **Architectural** | Sound; shallow capability layer; single consumer | Grow via one media app on KMOS; refine (not rebuild) the provider pattern |
| **Technical** | In-memory read models; no real IdP/secrets/tracing; provider adapters try-once | Pull real persistence/IdP/tracing by HA/scale demand; add resilience wrapper |
| **Governance** | Strong; KCSI-01 exemplary | Keep evidence-first + roadmap discipline as standing DoD; ratify the Ecosystem Constitution |
| **Documentation** | Now strong (KEAI-01 set); risk of drift/duplication across repos | One canonical doc per topic; keep the roadmap + failure catalog current; retire stale docs |

## 7. Net assessment

The architecture is **strong and validated**; the primary gap is **depth, not
soundness** — few capabilities extracted, one app built. The correct response is *not*
speculative expansion (that would manufacture over-abstraction debt) but **one more
evidence-bearing application** that converts the already-proven Candidate spine into
shared capabilities, plus a small set of low-risk refinements (translation, resilience,
quality-tier fallback). This is a healthy platform in adolescence, not a platform in
trouble.
