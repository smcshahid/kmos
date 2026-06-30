/**
 * Repository ports (KMOS-9999 §9-§13; Coding Constitution §2).
 *
 * Storage is reached only through these interfaces. The application core depends
 * on the ports; concrete adapters live in `infrastructure/`. This keeps the
 * domain free of any database driver and lets a Postgres adapter later replace
 * the in-memory one without touching callers.
 *
 * Versioning note: knowledge is IMMUTABLE (KMOS-0201). A "version" of an object
 * is appended as a new record; prior versions are preserved. The repository
 * therefore distinguishes the CURRENT (head) version from the full HISTORY.
 */

import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';

/**
 * An append-only versioned repository keyed by canonical id. Updating an object
 * appends a new version rather than overwriting; history is preserved so
 * corrections never destroy prior knowledge.
 */
export interface VersionedRepository<T extends CanonicalObject> {
  /** Append the first version of a new object. */
  add(object: T): void;
  /** Append a new version (object.version must exceed the current head). */
  appendVersion(object: T): void;
  /** The current (highest-version) record for an id, if any. */
  head(id: CanonicalId): T | undefined;
  /** All versions for an id in ascending version order (oldest first). */
  history(id: CanonicalId): readonly T[];
  /** Heads of every object in the repository (one entry per id). */
  heads(): readonly T[];
  /** True if the id exists at all. */
  has(id: CanonicalId): boolean;
}
