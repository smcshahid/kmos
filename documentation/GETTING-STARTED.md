# KMOS — Getting Started (5 minutes)

A brand-new engineer should be able to evaluate KMOS using only this page.

## 1. Prerequisites
- **Node.js 22+** (`node -v` ≥ v22). Nothing else is required for the offline path
  (no database, no network, no global tooling). The dev runner executes the
  TypeScript sources directly via `--experimental-strip-types` + a `.js`→`.ts`
  resolver hook (`tools/dev/`), so there is no build step for evaluation.

## 2. Verify the platform
```bash
npm run verify:offline
```
Expected: `KMOS architecture-fitness: OK (… 0 violations).` then `# pass 205  # fail 0`.

## 3. See it work end-to-end
```bash
npm run demo
```
Runs a full institutional knowledge lifecycle on the live platform and prints a
report: organization & actor → media import + transcription → knowledge
extraction + multilingual vocabulary → governance approval → publication →
preservation (integrity + evidence) → search → lineage / chain of custody →
explainable trust assessment → institutional audit rebuilt by replay (0 dead
letters).

## 4. Inspect health and seed sample data
```bash
npm run health   # all 9 services UP, bus healthy
npm run seed     # prints a sample organization, editor, concepts, and asset ids
```

## 4b. Run KMOS as a server (HTTP + web UI)
```bash
npm run serve   # http://localhost:8080  (UI at /, health at /health, metrics at /metrics)
```
Open `http://localhost:8080/` in a browser to create an organization, import a
lecture, extract knowledge, search, view lineage, publish with approval, and
inspect governance + the institutional audit — all without modifying source.

## 5. Where to go next
- `documentation/DEVELOPER-GUIDE.md` — day-to-day development, the canonical rules.
- `documentation/ARCHITECTURE.md` — the engines, kernel, and event flow.
- `documentation/CAPABILITY-DEVELOPMENT-GUIDE.md` / `WORKFLOW-DEVELOPMENT-GUIDE.md` — extend the platform.
- `documentation/DEPLOYMENT-GUIDE.md` — containers, compose, and the production roadmap.
- `engineering/IMPLEMENTATION_STATUS.md` — exactly what is shipped vs. staged.

## Note on scope
This RC is **library-grade**: services run in-process and are exercised through
the demo, scripts, tests, and programmatic application facades. A runnable HTTP API server and reference web UI are included (`npm run serve`),
backed by the in-memory platform. Real persistence, authentication, and cluster
deployment are part of the production substrate cycle; see the Deployment Guide.
