# Contributing to KMOS

KMOS is built strictly to its Constitution and specification series; the
**architecture is authoritative and is not redesigned** in contributions.

## Ground rules (enforced by `npm run fitness`)
- Import all canonical types/events from `@kmos/canonical-kernel` — never redefine them.
- One authoritative owner per canonical object; cross-service contact is canonical events + business APIs (no cross-service internal imports).
- Dependency direction: `applications → domains/connectors → capabilities → engines/platform → packages`.
- Business logic lives only in capabilities; workflows coordinate, never compute.
- Every meaningful change publishes a canonical event; events are immutable, versioned, replayable.

## Workflow
1. `npm run verify:offline` (architecture-fitness + full test suite) must pass before and after your change.
2. In CI, `npm run verify` additionally runs `eslint` + `tsc` (offline they need the registry; see DECISIONS D-E).
3. Add tests for new behavior (see `testing/`); keep coverage and fitness green.
4. Record significant decisions as ADRs in `documentation/adr/`. **Adding an ADR is not done until its row is added to `documentation/adr/README.md` and a `D-00N` entry to `engineering/DECISIONS.md`.**
5. New capabilities/workflows: follow `documentation/CAPABILITY-DEVELOPMENT-GUIDE.md` / `WORKFLOW-DEVELOPMENT-GUIDE.md`; templates in [`sdk/`](sdk/README.md).

## Trust the clean build, not the incremental one
`tsc --build` is incremental via `.tsbuildinfo`. After a change that alters a
**cross-package type** (a kernel/service signature others depend on), a stale
incremental build can report green locally while a clean build fails — this once
hid six real defects. **CI is authoritative** because `npm ci` starts from a clean
checkout with no `dist/`/`.tsbuildinfo`. Locally, before sign-off on a cross-cutting
change, force a clean build: `npm run clean && npm run typecheck` (or
`npx tsc --build --force`). Build artifacts (`dist/`, `*.tsbuildinfo`) are gitignored
and must never be committed.

## Large-file note
On some mounts the editor truncates large file writes; prefer shell here-docs for
big files and verify with `wc -c` + a syntax check.

## Reviews
Changes that touch the kernel require kernel-migration review (KMOS-9999 §20); see
`engineering/review/07-KERNEL-EVOLUTION-PLAN.md` for the template.
