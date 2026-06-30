# KMOS Troubleshooting Guide

Practical, command-level troubleshooting for evaluators and developers running
the KMOS reference implementation. Every command below matches `package.json`.

KMOS runs its TypeScript sources directly under Node 22's built-in test runner
with `--experimental-strip-types` plus a tiny dev-only `.js`->`.ts` resolver
hook (`tools/dev/resolver.mjs`, registered by `tools/dev/register.mjs`). There is
**no build, no `npm install`, and no database required** for the offline flows.
See `engineering/DECISIONS.md` D-E for the rationale.

---

## 1. Node version errors

KMOS requires **Node >= 22** (`engines.node` in `package.json`). The offline
runner depends on `--experimental-strip-types`, which is only available on
Node 22+.

Symptoms:
- `bad option: --experimental-strip-types`
- `Unknown or unexpected option`
- `SyntaxError` on TypeScript type annotations (Node strips types only on 22+).

Fix:
```bash
node --version        # must be v22.x or newer
```
Install/activate Node 22 (e.g. via `nvm install 22 && nvm use 22`) and retry.

---

## 2. Running the offline runner

The canonical offline gate is:
```bash
npm run verify:offline   # fitness + full test suite, no network
```
Individual pieces:
```bash
npm run fitness          # architecture-fitness checks only
npm test                 # full node:test suite via the dev resolver
npm run demo             # end-to-end knowledge lifecycle on the live platform
npm run health           # platform health dashboard
npm run seed             # sample organization + starter knowledge
```
All of these invoke `node --experimental-strip-types --import ./tools/dev/register.mjs ...`.

### Common failure modes

#### `ERR_MODULE_NOT_FOUND`
Almost always means the dev resolver did not run, or an import specifier does
not resolve to a real source file.

- Confirm the command includes `--import ./tools/dev/register.mjs`. Running a
  `.ts`/`.mts` file with bare `node file.ts` bypasses the resolver and breaks
  both the `@kmos/*` workspace mapping and the `.js`->`.ts` rewrite.
- The resolver maps `@kmos/<pkg>` to `<dir>/<pkg>/src/...` across
  `packages, platform, engines, capabilities, domains, connectors, applications, sdk`.
  If you added a new package, make sure it lives under one of those directories
  with a `src/` entry and a `package.json` `name` of `@kmos/<pkg>`.
- Sources use spec-correct NodeNext `.js` import specifiers (e.g.
  `./foo.js`). The resolver rewrites these to the sibling `.ts`. If you wrote a
  bare `./foo` (no extension), add the `.js` suffix.

#### `Unexpected token` / parse errors
Two distinct causes:

1. **Genuine syntax error** in a source file. Run a fast syntax check across all
   sources (no type checking, just parse):
   ```bash
   node --check path/to/file.ts        # single file
   ```
2. **Large-file truncation on some mounts.** On certain FUSE-style mounts the
   editor's write path truncates large files mid-write, producing a half-written
   file that fails to parse (this happened once to
   `platform/assets/src/application/asset-registry-service.ts`; see
   `engineering/KNOWN_ISSUES.md` E-02 and the remediation report
   `engineering/review/06-REMEDIATION-CERTIFICATION-REPORT.md` §3). Detect it by
   checking the byte size and the file tail:
   ```bash
   wc -c path/to/file.ts
   tail -n 5 path/to/file.ts          # should end with a proper closing brace
   ```
   **Fix: rewrite the file via a shell here-doc** (`cat > file <<'EOF' ... EOF`),
   which does not truncate, then re-verify with `node --check` and `wc -c`.

---

## 3. Architecture-fitness violations

`npm run fitness` (`node tools/fitness-checks/run.mjs`) enforces four
constitutional invariants. A clean run reports
`OK (... source files scanned, ... workspace packages mapped, 0 violations)`.
On failure it prints each violation prefixed by its rule and exits 1.

| Violation prefix | What it means | How to fix |
|---|---|---|
| `[dep-direction]` | A package imported **upward** in the layer stack (rank order: `packages` < `engines`/`platform` < `capabilities`/`sdk` < `connectors`/`domains` < `applications`). E.g. a capability importing an application. | Imports may only point down or sideways within the same rank. Invert the dependency, move the shared code lower (often into the kernel or a lower layer), or communicate via events/APIs instead of a direct import. |
| `[cross-service]` | One `platform/*` service deep-imported **another** platform service's internals (`@kmos/<other-service>`). | Platform services contact each other only through **events and public APIs**, never internal imports. Subscribe to the other service's canonical events, or call its published API surface. The only always-allowed `@kmos/*` import is `@kmos/canonical-kernel`. |
| `[kernel-purity]` | `packages/canonical-kernel` imported an infrastructure module (`pg`, `postgres`, `kafkajs`, `nats`, `amqplib`, `ioredis`, `mongodb`). | The kernel has **zero runtime dependencies** (D-F). Remove the infra import; if you need storage behavior, define a port in the kernel and put the adapter in a service's `infrastructure/` directory. |
| `[ports-adapters]` | An infra module was imported **outside** an `infrastructure/` directory. | Move the code that touches `pg`/broker/etc. into an `infrastructure/` directory behind a port. Domain cores stay infrastructure-free (D-006). |

---

## 4. "Unregistered canonical event type: ..."

Full message: `Unregistered canonical event type: <Type>`
(`KmosError` code `event.type.unregistered`), thrown by the bus during
`validateEvent` before persistence.

Cause: an event whose `identity.type` is not in the **canonical event catalog**
was published. Only the 97 catalogued types are publishable through the kernel
bus (single source of truth; remediation MED-5).

Fix: add the new type to the kernel catalog seed in
`packages/canonical-kernel/src/schema/event-catalog.ts` using the `def(...)`
helper, e.g.:
```ts
def('OrganizationCreated', 'IdentityService', 'Institutional', 'Identity'),
```
Do **not** register event types in a per-service local catalog — that
reintroduces the drift MED-5 removed. Related: `event.schema.version_mismatch`
means the event's `schemaVersion` does not match the catalog entry's
`schemaVersion`; align them.

---

## 5. "Optimistic concurrency conflict on stream append"

Full message: `Optimistic concurrency conflict on stream append`
(`KmosError` code `event.stream.version_conflict`), thrown by
`InMemoryEventLog.append` when a publish passes `expectedVersion` and it does not
equal the stream's current version.

Cause: two writers raced on the same stream, or the caller computed
`expectedVersion` from a stale read.

Fix: re-read the stream's `currentVersion(streamId)`, re-apply the intended
change on top of the latest state, and retry the publish with the fresh
`expectedVersion`. This is expected optimistic-concurrency behavior, not a bug;
consumers must be idempotent (assumption A-02) so retries are safe.

---

## 6. Offline environment limits (no `tsc` / `eslint` / registry)

This sandbox has **no TypeScript compiler, no ESLint, and a blocked npm
registry** (`engineering/KNOWN_ISSUES.md` E-01). Therefore:

- `npm run lint`, `npm run typecheck`, `npm run build`, and the full
  `npm run verify` require `npm ci` and a reachable registry — they run in **CI**,
  not offline.
- The offline equivalent is `npm run verify:offline` (fitness + tests), which is
  the supported local gate (D-E).
- For a fast type-free syntax pass across sources when you cannot run `tsc`:
  ```bash
  for f in $(find packages platform engines capabilities domains connectors applications -name '*.ts' -not -name '*.test.ts'); do node --check "$f" || echo "FAILED: $f"; done
  ```
  This catches parse errors (including truncation) but not type errors; only a
  real `tsc` run in CI confirms type safety.

---

## 7. Running a single test file

The test runner is `node:test`. To run one file (with the resolver):
```bash
node --experimental-strip-types --import ./tools/dev/register.mjs --test testing/resilience/event-migration.test.ts
```
Filter by test name within a file:
```bash
node --experimental-strip-types --import ./tools/dev/register.mjs --test --test-name-pattern="backward-compatible" testing/resilience/event-migration.test.ts
```
Scoped suites are also available as scripts:
```bash
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:security
npm run test:perf
npm run test:certification
```

---

## 8. Reading dead-letters

The bus never throws on a subscriber failure; after bounded retry
(`maxAttempts`, default 3) it records a **dead-letter** instead. Inspect them via
the bus API:
```ts
const failed = bus.getDeadLetters();
// each: { subscriber, stored, error, attempts, firstSeen, lastSeen }
```
The end-to-end demo prints the count (`npm run demo` reports
`dead letters: <n>`; a healthy run reports `0`). If the count is non-zero:

- `subscriber` identifies the failing handler; `error` is its message; `attempts`
  shows how many retries occurred.
- A `KmosError` with `retryable === false` dead-letters immediately (no retry).
- Because delivery is at-least-once and handlers are idempotent (A-02), you can
  re-deliver a stored event with `bus.redeliver(stored)` once the handler bug is
  fixed.
