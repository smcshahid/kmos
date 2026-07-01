# Knowledge Studio — Release Strategy

How Knowledge Studio versions, gates, and ships — designed to let the product evolve for
years while staying trustworthy at every release.

## Versioning

Semantic Versioning, product-facing:

- **MAJOR** — a new product capability class or a breaking API/behavior change (e.g. new
  content-type framework, clip rendering).
- **MINOR** — additive features and new outputs (a new download artifact, a new capability
  adapter) that don't break existing integrations.
- **PATCH** — fixes, docs, performance, accessibility, and internal improvements.

The app tracks the KMOS platform it targets; it depends only on **public KMOS business
APIs** and never on the frozen kernel internals, so platform patch/minor upgrades are
transparent.

## Quality gates (every release)

A release is cut only when all pass on the release commit:

- `tsc --build` green · `eslint` clean · **0** architecture-fitness violations · full test
  suite passing · live HTTP smoke (health, process the sample, open a concept, download).
- Docs updated (Release Notes + any affected guide); ADR added for notable decisions.
- For user-facing or architectural changes: an **independent review** pass (product, UX,
  accessibility, security, performance, maintainability) — the bar this product sets for the
  ecosystem.

The Docker image is **self-proving**: it runs the full verification gates at build time, so
a built image is a passed image.

## Channels & cadence

- **main** is always releasable (gates green).
- Tagged releases (`knowledge-studio-vX.Y.Z`) carry Release Notes; the container image is
  built from the tagged commit.
- Cadence is value-driven, not calendar-driven: ship when a coherent, gate-passing
  increment is ready. V1 → V1.x deepens the core and connects production AI; see
  [ROADMAP.md](ROADMAP.md).

## Compatibility & data

The **KMOS event log is the system of record**; knowledge, lineage, and trust survive app
upgrades and rollbacks (roll the image; the durable log is unchanged). The HTTP API is
versioned by behavior; additive changes are MINOR, breaking changes are MAJOR and
documented in Release Notes with a migration note.

## Rollback

Because the event log is authoritative and read models rehydrate on boot, rolling back to a
prior image restores prior behavior without data loss. See
[OPERATIONS-GUIDE.md](OPERATIONS-GUIDE.md).
