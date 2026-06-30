# KMOS Developer Guide

**Audience:** an engineer joining the KMOS reference implementation.
**Goal:** get you productive — set up, run, understand the layout, and follow the
canonical rules — without claiming features that do not exist yet.

> **What this codebase is today.** KMOS is a **library-grade reference
> implementation**: the real services, domains, and applications are composed
> **in one process** on a shared canonical event bus, reached through
> programmatic facades, with a runnable end-to-end demo. There is **no HTTP
> server and no UI**, and persistence is **in-memory behind ports**. See
> §9 (What works today vs. what is gated to CI) and
> `engineering/IMPLEMENTATION_STATUS.md`.

For the architectural model, read `documentation/ARCHITECTURE.md` first; this
guide is the practical companion.

---

## 1. Prerequisites

- **Node.js 22 or newer** (`"engines": { "node": ">=22" }` in `package.json`).
  Verify with `node --version` — it must report `v22.x` or higher. Node 22 is
  required because the dev runner relies on `--experimental-strip-types`.
- **Git.**
- That is all you need to run the **offline** workflow (fitness + tests + demo).
  No `npm install` is required for the offline path — there are **no runtime
  dependencies to fetch** for fitness, the test runner, or the demo.
- `eslint` and `tsc` (used by the full `npm run verify`) live in
  `devDependencies` and require `npm ci`, which needs registry access (see §9).

Clone and check your Node version:

```bash
git clone <repo-url> kmos && cd kmos
node --version          # must be v22+
```

---

## 2. How the offline dev runner works (and why)

The sandbox this project was built in **blocks the npm registry** and the
constitution favors minimal dependencies and institutional longevity. Two
decisions follow (`engineering/DECISIONS.md`):

- **D-E — test runner is Node's built-in `node:test`** (not vitest), run with
  `--experimental-strip-types` so Node executes the TypeScript sources directly,
  with **zero external test dependencies**.
- **A tiny dev-only `.js` → `.ts` resolver** in `tools/dev/` lets those sources
  run without a build step.

Concretely, the test and demo scripts launch Node like this:

```
node --experimental-strip-types --import ./tools/dev/register.mjs <entry>.mts
```

- `--experimental-strip-types` makes Node run `.ts`/`.mts` directly by stripping
  type annotations — no compile step, no emitted JS.
- `tools/dev/register.mjs` registers `tools/dev/resolver.mjs`, a module-resolution
  hook with **two jobs**:
  1. Map spec-correct ESM `".js"` import specifiers to their sibling `".ts"`
     source. (Sources use NodeNext-correct `.js` specifiers — e.g.
     `import './bus.js'` — which is what `tsc` expects for the shipped build; the
     resolver redirects them to `.ts` only when running from source.)
  2. Map workspace package names `@kmos/<pkg>` to that package's `src` entry,
     searching `packages`, `platform`, `engines`, `capabilities`, `domains`,
     `connectors`, `applications`, `sdk` in order — so cross-package imports keep
     clean boundaries offline.

**Production never uses this hook.** In CI, `tsc` emits real `.js` and npm
workspaces + package `"exports"` resolve `@kmos/*` to built `dist`. The resolver
is strictly a developer convenience for running source offline.

---

## 3. Monorepo layout

npm workspaces; top-level directories map onto **architectural layers**, not
technologies (KMOS-10020). Imports may only point **down** the stack.

| Directory        | Layer / rank | What lives here                                                        |
|------------------|--------------|-----------------------------------------------------------------------|
| `packages/`      | 0            | `canonical-kernel` — the single source of truth                       |
| `engines/`       | 1            | `observability`, `platform-catalog`                                   |
| `platform/`      | 1            | the 10 core services (the seven engines + Configuration + Search)     |
| `capabilities/`  | 2            | `reference-capabilities` (all business logic, behind contracts)       |
| `sdk/`           | 2            | SDK packages (reserved)                                               |
| `connectors/`    | 3            | `connector-framework` (external-system adapters)                      |
| `domains/`       | 3            | `media`, `language`, `publishing`, `preservation`, `ai-collaboration` |
| `applications/`  | 4            | `knowledge-studio`, `research-portal`, `archive-explorer`, `administration`, `public-api`, `learning-platform` (thin) |
| `testing/`       | —            | integration, contract, resilience, performance, security, certification suites |
| `tools/`         | —            | `dev/` (resolver), `fitness-checks/` (architecture gates)             |
| `documentation/` | —            | this guide, ARCHITECTURE, OPERATIONS-GUIDE, SECURITY-REVIEW           |
| `engineering/`   | —            | living memory: IMPLEMENTATION_STATUS, DECISIONS, KNOWN_ISSUES, reviews |
| `specifications/`, `constitution/`, `reference/` | — | the authoritative architecture |

A typical service package follows ports-and-adapters internally:

```
platform/<service>/src/
  index.ts                       # public surface (barrel)
  domain/        types.ts ports.ts ...     # pure core; depends only on ports + kernel
  application/   <service>-service.ts        # the service facade / use cases
  infrastructure/  in-memory-repository.ts   # adapters (the ONLY place infra imports are allowed)
platform/<service>/test/*.test.ts            # node:test suites
```

---

## 4. The commands you will actually run

Every command below **exists in `package.json`** and is listed here with what it
does and what it needs.

| Command                  | What it runs                                                                 | Network? |
|--------------------------|-----------------------------------------------------------------------------|----------|
| `npm run verify:offline` | `npm run fitness && npm test` — the offline gate                            | No       |
| `npm test`               | `node --test` over every `*.test.ts` across all workspaces (via the dev runner) | No   |
| `npm run fitness`        | `node tools/fitness-checks/run.mjs` — architecture-fitness checks           | No       |
| `npm run demo`           | runs `examples/knowledge-lifecycle-demo.mts` end-to-end on the live platform| No       |
| `npm run lint`           | `eslint .`                                                                   | Yes (`npm ci`) |
| `npm run typecheck`      | `tsc --build`                                                                | Yes (`npm ci`) |
| `npm run build`          | `tsc --build` (emit JS)                                                      | Yes (`npm ci`) |
| `npm run clean`          | `tsc --build --clean`                                                        | Yes (`npm ci`) |
| `npm run verify`         | `lint && typecheck && fitness && test` — the **full** gate                  | Yes (`npm ci`) |

### 4.1 The offline gate (your everyday loop)

```bash
npm run verify:offline
```

Runs the fitness checks then the full test suite. At the certified baseline:

- **Tests:** 201 tests, 201 pass, 0 fail.
- **Fitness:** `KMOS architecture-fitness: OK (131 source files scanned, 26 workspace packages mapped, 0 violations).`

Run just one of them when iterating:

```bash
npm test            # all suites
npm run fitness     # architecture gates only
```

### 4.2 Run the reference demo

```bash
npm run demo
```

This composes the real services/domains/applications on **one shared event bus**
and runs a full institutional journey. Expected output (summarized):

```
== 1. Organization & actor (Identity) ==          org + editor created
== 2. Media import + transcription ==             audio + transcript assets; workflow=Completed
== 3. Language -> Knowledge ==                     concepts created: 2 (with en/ar vocabulary)
== 4. Publication with governance approval ==      released=true
== 5. Preservation ==                              preserved=2 failed=0
== 6. Search & discovery ==                        query "Sincerity" -> 1 hit
== 7. Lineage / chain of custody ==                transcript ancestors reach source audio: true
== 8. Trust assessment (explainable) ==            trusted=true score=0.71 (+ per-factor reasons)
== 9. Institutional audit + replay ==              total canonical events: 88; dead letters: 0
                                                   (events-by-producer rebuilt purely by replay)
== Result ==                                       End-to-end knowledge lifecycle completed.
```

The `88 events / 0 dead letters` line and the replay-rebuilt projection are the
proof that the event backbone and institutional-memory reconstruction work
end-to-end. If your numbers differ, something changed the event flow — investigate
before committing.

### 4.3 The full gate (in CI)

```bash
npm ci          # requires registry access
npm run verify  # eslint + tsc + fitness + tests
```

Use this when you have registry access; in the offline sandbox use
`verify:offline` and let CI run `lint`/`typecheck` (see §9).

---

## 5. Adding a capability, domain, or application

KMOS grows by **extension, not redesign** (the constitution's standard). Place
new code in the layer that matches its responsibility and respect the
dependency-direction rule (§3). Use an existing sibling as the template:

- **New capability** → `capabilities/`. Capabilities hold **all business logic**
  behind a published contract. Template:
  `capabilities/reference-capabilities`. Register it with the Capability Registry
  (KMOS-0205) and run it through the Capability Runtime (KMOS-0160/0210); emit
  capability-execution events. Do not put business logic in domains, workflows,
  or apps.
- **New domain** → `domains/`. Domains **orchestrate** capabilities and services
  into an institutional journey; they coordinate, they do not compute. Template:
  `domains/media` (note `infrastructure/runtime-invoker.ts` as the adapter
  pattern). A domain may import capabilities and platform services (downward) but
  not another domain or an application.
- **New application** → `applications/`. Applications are **thin** views that read
  through services. Template: `applications/knowledge-studio` or
  `applications/archive-explorer` (both demonstrate reading through a service).
  No business logic in applications.
- **New connector** → `connectors/`. Translate an external system into canonical
  events. Template: `connectors/connector-framework`.

In each case: add the package under the right directory with its own
`package.json` (`"name": "@kmos/<pkg>"`), export a clean barrel from `src/index.ts`,
keep infrastructure imports inside an `infrastructure/` directory, add a
`test/*.test.ts` suite, and run `npm run verify:offline`. The fitness checker
discovers your package automatically from its `package.json` name and enforces
the layer rules on it.

> There are no separate step-by-step scaffolding guides in the repo yet; the
> sibling packages above are the authoritative templates. The relevant
> specifications are KMOS-0120/0160/0205/0210 (capabilities/runtime), KMOS-0200
> (services), KMOS-0170/0180 (extensions/API), and KMOS-10050 (Atlas / reference
> apps).

---

## 6. Canonical rules a developer must follow

These are enforced by `tools/fitness-checks` and/or the test suites. Breaking one
fails `npm run verify:offline`.

1. **Import canonical types only from `@kmos/canonical-kernel`.** Canonical
   objects, the event envelope, the event catalog, ids, lifecycle, errors, and
   the security primitives live in the kernel and are **never redefined**
   elsewhere (KMOS-9999 §7).
2. **One authoritative owner per object.** Each canonical object type is owned by
   exactly one service; other services reference its canonical id and never
   duplicate ownership (KMOS-10030).
3. **An event for every change.** Every business change publishes a canonical
   past-tense event through the bus; history is immutable and replayable. Read
   models (graph, search) are projections, never the system of record.
4. **Respect dependency direction.** `applications → domains/connectors →
   capabilities → engines/platform → packages`. Imports may only point down.
5. **No cross-service imports.** A platform service may not import another
   platform service's internals — cross-service contact is **events + business
   APIs** only. (The Workflow Service reaches the Runtime through a port, wired in
   the composition root.)
6. **Infrastructure only behind ports.** Database/broker/IdP/secret/model code
   lives in an `infrastructure/` directory behind an interface; the kernel imports
   no infrastructure at all. Domain cores stay infrastructure-free.
7. **Determinism.** Inject clocks (`now()`); never call `Date.now()` /
   `new Date()` directly in business logic, so replay and reconstruction are
   deterministic.
8. **Use the canonical error taxonomy** (`KmosError` with a category) so
   orchestration can decide retry vs. dead-letter vs. compensate.

---

## 7. Where to look when something breaks

- **A fitness violation** prints the rule tag and file, e.g.
  `[dep-direction] ... imports upward ...`, `[cross-service] ...`,
  `[kernel-purity] ...`, `[ports-adapters] ...`. Fix the import; see
  `constitution/CODING-CONSTITUTION.md`.
- **An "Unregistered canonical event type" error** at publish time means the
  event type is not in the kernel catalog (`packages/canonical-kernel/src/schema/
  event-catalog.ts`) — add it there (with owner/class/category) rather than
  inventing a local type.
- **A schema-version mismatch** means the event's `schemaVersion` differs from the
  catalog entry; align them.
- **Dead letters in a flow** mean a subscriber handler threw; check
  `bus.getDeadLetters()`. The demo expects **0**.
- **A `.js` import "module not found" when running from source** usually means the
  dev runner is not active — make sure you launch via the `npm run` scripts (they
  add `--import ./tools/dev/register.mjs`).

---

## 8. Useful entry points to read first

- `packages/canonical-kernel/src/index.ts` — the kernel surface.
- `packages/canonical-kernel/src/event-bus/bus.ts` — validate → enforce → append → dispatch.
- `examples/knowledge-lifecycle-demo.mts` — the end-to-end composition.
- `platform/knowledge/src/` — a model service (ports + in-memory adapter + facade).
- `tools/dev/resolver.mjs` — how source runs offline.
- `tools/fitness-checks/run.mjs` — the rules that gate every change.

---

## 9. What works today vs. what is gated to CI

**Works today, fully offline:**

- `npm run verify:offline` (fitness + 201 tests), `npm run demo`.
- The complete in-process platform: the seven engines + Configuration + Search,
  capabilities, domains, applications, the canonical event bus, replay, and
  governance/trust — all exercised by the demo and the test suites.
- The Postgres `EventLog` adapter and DDL are **code-complete and contract-tested**
  against an in-memory fake `SqlClient` (proving storage replaceability behind the
  port).

**Gated to a real CI / cloud environment (present as plan/mechanism, not run here):**

- **`npm run lint` / `npm run typecheck` / `npm run verify`** — need `npm ci`
  (registry access). In CI these run eslint and `tsc`; offline they are skipped in
  favor of `verify:offline` (decision D-E).
- **Async kernel event-log migration (KEP-001 / review CRIT-1)** — converging the
  synchronous kernel `EventLog` port onto one async contract; a type-level
  refactor that must land under `tsc` in CI. Plan:
  `engineering/review/07-KERNEL-EVOLUTION-PLAN.md`.
- **Pervasive identity/attribution (CRIT-2)** — threading `CallContext` through
  every write path; the kernel mechanism exists, full wiring is co-executed with
  KEP-001.
- **Real persistence** — running PostgreSQL + migrations + live integration.
- **Real security** — OIDC/JWT IdP, mTLS/SPIFFE, Vault, encryption-at-rest,
  signed events / WORM (`documentation/SECURITY-REVIEW.md`).
- **Deployment server + reference UI** — not built; the platform is library-grade
  and the demo is the entry point.

Treat the gated items as the production-hardening roadmap, not as bugs. The living
ledger is `engineering/IMPLEMENTATION_STATUS.md`; decisions are in
`engineering/DECISIONS.md`; risks in `engineering/KNOWN_ISSUES.md`.
