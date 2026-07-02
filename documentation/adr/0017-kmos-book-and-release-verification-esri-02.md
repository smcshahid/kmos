# ADR 0017 — The KMOS Book, verified release engineering & automated packaging (ESRI-02)

## Status

**Accepted-plan** — final documentation & release-readiness initiative before shifting
primary investment to products. Consistent with ADR-0012/0014/0016 and the Ecosystem
Constitution. Plan: `engineering/ESRI-02-DOCUMENTATION-AND-RELEASE-READINESS-PLAN.md`.

## Context

The ecosystem is functionally and operationally complete (KMOS, capability layer, two
flagships, provider independence, operational docs). What remains is **legibility and
verified release engineering**: a future team must understand and run the ecosystem from the
documentation alone, and releases must be verified (not assumed) and reproducible from a tag.

A real, evidence-first finding opened this initiative: `gh run list` showed **CI failing on
all four prior initiative PRs** — `npm ci` could not install because `package-lock.json` was
never regenerated for the new workspace packages (offline sandbox, blocked registry). This is
exactly the "verify, don't assume" risk the mission targets.

## Decision

1. **Fix and verify CI first.** Regenerate `package-lock.json` (no new external deps);
   `npm ci` becomes valid again; verify green on a real CI run. Never weaken `npm ci` to mask
   a lock problem.
2. **Author The KMOS Book** — one coherent, authoritative engineering handbook (Vision,
   Architecture, Capability Layer, Building Applications, Operations, Governance, Future),
   written as a book (not a concatenation), that is the primary entry point and references the
   detail docs. It must let a new engineering org operate KMOS without historical context.
3. **Automate release + packaging.** A tag-triggered workflow runs tests → builds the image →
   publishes to Docker Hub → packages the Olares Application Chart `.tgz` → creates a GitHub
   Release with artifacts (chart, notes, checksums). The GitHub Release becomes the
   authoritative download location. Document what is automated vs. manual.
4. **Verify, don't assume.** Audit tags, releases, workflow runs, and Docker Hub via real
   `gh`/registry calls; record honest outcomes; fix what is fixable in this environment and
   state precisely what requires a networked/Docker environment.
5. **Consolidate docs; validate providers; codify manual-testing-last.** One authoritative
   source per topic (index exists); confirm provider-switching is config-only and document the
   remaining native adapters; keep human validation the final, product-focused step.

No new product functionality; no architectural redesign; the kernel/constitution stay frozen.

## Consequences

- CI is green and releases are verifiable and reproducible from a tag.
- A single handbook makes the ecosystem legible to future teams without conversation history.
- Releases produce complete, downloadable artifacts from the GitHub Release — no manual
  packaging, no repository spelunking.
- Honest evidence (including what this environment cannot verify) replaces assumption.

## Alternatives considered

- **Change CI from `npm ci` to `npm install`.** Rejected — masks the lock problem and loses
  reproducibility; the lock fix is the correct solution.
- **Concatenate existing docs into "the book".** Rejected — the mission requires a coherent
  handbook; concatenation would perpetuate drift.
- **Assume prior releases succeeded.** Rejected — the mission's core rule is evidence over
  assumption; verification found a real CI failure.

## References

- `engineering/ESRI-02-DOCUMENTATION-AND-RELEASE-READINESS-PLAN.md`; ADR-0016 (providers/ops);
  `.github/workflows/`; `documentation/README.md` (doc index).
