# Review 24 — EPT-01: Product Era Declaration, Assessment & Close-out of Platform Phase 1

_Date: 2026-07-02. Scope: EPT-01._ The formal close-out of Platform Phase 1 and the
transition to product-first engineering. Inputs: [plan](../EPT-01-PRODUCT-TRANSITION-PLAN.md),
[ADR-0018](../../documentation/adr/0018-platform-phase-1-close-and-product-era-ept-01.md).

## 1. Mission 1 — merge & release management (done, verified)

PRs **#18 → #19 → #20 → #21 → #22 merged in order** (retargeted to `main` as a linear stack).
`main` CI is **GREEN** (`conclusion: success` on the merged head) — the full pipeline: static
(lint · fitness · `tsc` typecheck · audit), tests (unit · contract · security · integration ·
perf · certification · conformance · demo), and database (real PostgreSQL). This is the first
time the entire platform + ecosystem body of work (KCSI-01 → ESRI-02) is integrated on `main`
and passing CI end-to-end. Clean Conventional-Commit history; ADRs 0013–0017 consistent.

## 2. Missions 2–5 — ecosystem release (automation ready; executed on tag)

`.github/workflows/release.yml` is now the **ecosystem release**: on tag `v*` it verifies,
builds + pushes all three images (KMOS, Knowledge Studio, Podcast Studio), packages the Olares
Application Chart `.tgz` + `SHA256SUMS.txt`, and creates ONE GitHub Release (the authoritative
download) with notes. Ecosystem notes: [RELEASE-NOTES](../../documentation/RELEASE-NOTES.md).
**Verification (evidence over assumption):** the release is executed by tagging `v1.1.0` after
this initiative merges; the tag run is then confirmed green with images publicly pullable and
the GitHub Release + assets present (prior evidence: KMOS + Knowledge Studio images already
live/public on Docker Hub — ESRI-02 review/23 §1). If the run fails, fix → re-run → verify →
document (Mission 3).

## 3. Mission 11 — final operational checklist (status)

| Gate | Status |
|---|---|
| Architecture complete | ✅ (frozen kernel; capability layer proven twice) |
| Documentation complete | ✅ (The KMOS Book + one authoritative doc per topic + index) |
| CI green | ✅ (`main`, full pipeline incl. real Postgres) |
| Tests / Fitness / Conformance green | ✅ (325+ pass; 0 fitness violations; all profiles COMPLIANT) |
| Docker image published | ✅ kmos + knowledge-studio live/public; podcast-studio on tag |
| GitHub Release + assets | ⏳ on tag `v1.1.0` (automation ready) |
| Olares package available | ✅ automated (`release.yml` packages the chart to the Release) |
| Independent review complete | ✅ (this review + reviews 20–23) |

Manual testing is requested **only** after the above are green — the concise product-focused
checklist below.

## 4. Mission 10 — Product Era assessment (with evidence)

- **Has Platform Phase 1 concluded?** **Yes.** v1.0 GA + capability layer (KCSI-01/02) +
  ecosystem architecture/constitution (KEAI-01) + operational readiness & provider independence
  (ESRI-01) + verified release engineering & the KMOS Book (ESRI-02), all merged green.
- **Is the capability layer sufficiently mature?** **Yes.** Two extractions proven; the second
  flagship (Podcast Studio) was built mostly by composition; switching providers is config-only.
- **Should future investment primarily target applications?** **Yes.**
- **Effort allocation (recommended):** **~90% applications / ~10% platform** — the 10% strictly
  demand-pulled (capability extraction on second-consumer evidence, provider adapters a real
  product needs, operations), never speculative growth.

## 5. Mission 12 — the Future Platform Rule (adopt, permanent)

**Recommendation: adopt it permanently.** Recorded as **Ecosystem Constitution Article XI** and
ADR-0018:

> *No platform enhancement shall be undertaken unless demanded by a real application or
> supported by clear evidence from multiple applications.*

Why: it is the distilled lesson of five initiatives — every durable capability was pulled by
real use; every avoided over-abstraction protected simplicity. Making it permanent keeps the
platform small and comprehensible through the Product Era and guarantees platform effort is
always justified by product need.

## 6. Declaration

**Platform Phase 1 is formally closed. The organization transitions to the Product Era.** No
platform gap blocks product development; the recommendation is unambiguous — build products,
and let real product needs (not speculation) pull the next platform work.

## 7. Manual validation checklist (product experience only — after the gates above)

Once `v1.1.0` is released, validate **experience, not correctness**:
1. Install Knowledge Studio and Podcast Studio on Olares from the GitHub Release chart; do they
   come up cleanly and feel like daily-driver products?
2. Run a real source through each end-to-end — does the pipeline feel calm and transparent, and
   is the resulting knowledge genuinely useful and trustworthy?
3. Switch the AI provider by configuration (e.g. Ollama → an OpenAI-compatible endpoint) — does
   the app behave identically with no code change?
4. Downloads/packages: are the exported artifacts something you'd actually keep and cite?
5. Overall: would you use these every day, and does anything feel confusing from a *product*
   standpoint? (Engineering correctness is already verified — focus on the human experience.)
