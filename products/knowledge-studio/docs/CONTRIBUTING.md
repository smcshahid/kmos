# Contributing to Knowledge Studio

Knowledge Studio holds the same engineering discipline as the KMOS platform. It is the
quality standard for every future KMOS application, so contributions are held to it.

## Ground rules (the invariants)

1. **Thin over KMOS.** No business logic and no canonical objects in the app; call a KMOS
   service. Never bypass the platform.
2. **AI behind contracts.** Never call a model directly; go through a KMOS capability. Keep
   provider independence.
3. **Never fabricate evidence.** Projections *surface* real transcript passages or show
   none. Pipeline `mode` tags stay honest.
4. **Kernel is frozen** (ADR-0012). Real platform gaps go through the governed KMOS process,
   not a workaround.

## Workflow

1. Understand the change; read [ARCHITECTURE.md](ARCHITECTURE.md) and
   [DEVELOPER-GUIDE.md](DEVELOPER-GUIDE.md).
2. Branch; make focused commits using **Conventional Commits**
   (`feat(knowledge-studio): …`, `fix(…)`, `docs(…)`, `test(…)`).
3. Add/adjust tests. Pure logic → unit tests (`test/transcript`, `test/projections`);
   pipeline/KMOS behavior → integration (`test/studio`).
4. Run the gates locally (all must pass):

   ```bash
   npx tsc --build
   npx eslint products/knowledge-studio
   node tools/fitness-checks/run.mjs
   node --experimental-strip-types --import ./tools/dev/register.mjs --test products/knowledge-studio/test/*.test.ts
   ```

5. Update docs (User/Developer/API/Deployment as relevant) and, for notable decisions, add
   an ADR under `docs/adr/` and link it.
6. Open a PR with a clear description and the passing gate output. Expect code review and,
   for user-facing or architectural changes, UX/accessibility/security consideration.

## Conventions

ES modules with `.js` import specifiers; TypeScript strict; **await every asynchronous KMOS
call** (no fire-and-forget); zero runtime dependencies (node built-ins only); accessible,
calm UI (WCAG 2.2 AA). Match the surrounding code's naming and comment density.

## Definition of done

Builds · tests pass · lint clean · **0** fitness violations · docs updated · invariants held
· reviewed for maintainability and accessibility.
