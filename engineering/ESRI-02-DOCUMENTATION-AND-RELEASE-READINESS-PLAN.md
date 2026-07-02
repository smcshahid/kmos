# ESRI-02 — Final Ecosystem Documentation & Release Readiness

_Plan · 2026-07-01._ The final polish so future engineering organizations (human or AI) can
understand, operate, extend, deploy, and maintain KMOS **without historical conversation
context**. Governed by the [Ecosystem Constitution](../documentation/ecosystem/ECOSYSTEM-CONSTITUTION.md)
and [ADR-0017](../documentation/adr/0017-kmos-book-and-release-verification-esri-02.md).
No new functionality; no architectural redesign.

## Missions → work packages

- **WP0 — Propose.** This plan + ADR-0017. _(done)_
- **WP1 — CI fix (Mission 4, evidence-first).** CI was RED on #18–21 (`npm ci` lock mismatch);
  regenerate `package-lock.json`; verify green on this PR. **Done + pushed; verifying.**
- **WP2 — The KMOS Book (Mission 1).** One coherent authoritative handbook (7 parts:
  Vision, Architecture, Capability Layer, Building Applications, Operations, Governance,
  Future) — the primary entry point, referencing detail docs. Not a concatenation.
- **WP3 — Release engineering audit + automation (Missions 3, 6, 7).** Document the complete
  release workflow; add an automated release workflow that, on a version tag, runs tests →
  builds the image → publishes to Docker Hub → packages the Olares Application Chart `.tgz`
  → creates a GitHub Release with artifacts (chart, notes, checksums). Document automated vs
  manual.
- **WP4 — Verification audit (Missions 4, 5).** Real `gh`/registry evidence of tags, releases,
  workflow runs, and Docker Hub state; document outcomes honestly; fix what is fixable here.
- **WP5 — Provider validation (Mission 8).** Confirm switching providers is configuration-only;
  document exactly which native adapters remain (Gemini/Claude/Bedrock) and that apps need
  zero modification.
- **WP6 — Doc audit + manual checklist (Missions 2, 9).** One authoritative source per topic
  (index already exists); a concise product-focused manual validation checklist.
- **WP7 — Final assessment (Mission 10) + close-out.** Answer the 10 questions with evidence;
  ADR-0017 → executed; governance updated.

## Guardrails

- **Evidence over assumption** — verify releases/CI/Docker Hub with real `gh`/registry calls;
  never claim success unverified; state honestly what a networked/Docker environment must
  confirm.
- **One authoritative doc per topic**; the Book is the entry point, detail docs are the depth.
- No speculative engineering, no redesign, Conventional Commits, clean history.

## Success criteria

The KMOS Book exists as the definitive handbook; docs are coherent/consolidated; **CI is
verified green** (not assumed); release engineering is documented + automated on tag; Docker
Hub + GitHub Release artifacts are addressed; the final assessment answers the 10 questions
with evidence and recommends whether to shift focus to products.
