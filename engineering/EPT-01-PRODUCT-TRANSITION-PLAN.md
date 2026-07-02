# EPT-01 — Ecosystem Finalization & Product Transition

_Plan · 2026-07-02._ The formal close-out of **Platform Phase 1** and the transition to the
**Product Era**. Governed by [ADR-0018](../documentation/adr/0018-platform-phase-1-close-and-product-era-ept-01.md).
Not a platform initiative: no redesign, no speculative capabilities, no new frameworks.

## Work packages

- **WP0 — Propose.** This plan + ADR-0018. _(done)_
- **WP1 — Merge & release management (Mission 1).** Merge PRs #18→#22 in order; verify `main`
  CI green. **Done + verified** (`main` = green).
- **WP2 — Ecosystem release (Missions 2, 5, 7).** Enhance `release.yml` to a 3-image
  ecosystem release (KMOS + Knowledge Studio + Podcast Studio) + Olares chart + checksums +
  notes; ecosystem RELEASE-NOTES; tag `v1.1.0`.
- **WP3 — Release/Docker/Olares validation (Missions 3, 4, 5).** Verify — not assume — the
  release ran, images published + publicly pullable, tag + GitHub Release + assets exist;
  fix + re-run + document if not.
- **WP4 — Status & vision (Missions 6, 9).** `ECOSYSTEM-STATUS.md` (one-page dashboard) +
  `VISION-2030.md`. **Done.**
- **WP5 — Docs (Missions 7, 8).** KMOS Book final review (coherent, current, cross-linked);
  documentation consolidation (one authoritative source per topic; index verified).
- **WP6 — Product Era declaration + rules (Missions 10, 11, 12).** Engineering assessment
  (Phase 1 concluded? effort split — recommend %); final operational checklist; adopt the
  **Future Platform Rule** as a permanent principle (ADR-0018 + Ecosystem Constitution).

## Guardrails

Evidence over assumption (verify releases with real `gh`/registry calls); no platform
redesign; no speculative capabilities/frameworks; Conventional Commits; ADR + version
consistency; manual testing only after all engineering gates are green.

## Success criteria

One clean ecosystem release; workflows + Docker Hub + Olares packages verified; GitHub
Releases canonical; KMOS Book is the primary handbook; ECOSYSTEM-STATUS + VISION-2030 exist;
docs consolidated; **Platform Phase 1 formally closed**; organization transitioned to
product-first with an evidence-based effort recommendation.
