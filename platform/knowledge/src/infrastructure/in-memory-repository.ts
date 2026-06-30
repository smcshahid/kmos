/**
 * In-memory versioned repository adapter (Coding Constitution §1/§2).
 *
 * The modular-monolith-first implementation behind the VersionedRepository
 * port. History is append-only: each id maps to an ordered list of versions
 * (oldest first); the head is the last element. A Postgres adapter implementing
 * the same port can replace this without changing the application core. This is
 * the ONLY layer permitted to hold mutable storage state (zero infra modules
 * are imported here — storage is an in-process Map, so the package keeps zero
 * runtime dependencies).
 */

import { KmosError, type CanonicalId, type CanonicalObject } from '@kmos/canonical-kernel';
import type { VersionedRepository } from '../domain/ports.js';

export class InMemoryVersionedRepository<T extends CanonicalObject>
  implements VersionedRepository<T>
{
  /** id -> versions in ascending order (oldest first; head is last). */
  private readonly byId = new Map<CanonicalId, T[]>();

  add(object: T): void {
    if (this.byId.has(object.id)) {
      throw new KmosError(`Object already exists: ${object.id}`, {
        category: 'Conflict',
        code: 'knowledge.repository.duplicate_id',
        subject: object.id,
      });
    }
    this.byId.set(object.id, [object]);
  }

  appendVersion(object: T): void {
    const versions = this.byId.get(object.id);
    if (!versions) {
      throw new KmosError(`Cannot version unknown object: ${object.id}`, {
        category: 'NotFound',
        code: 'knowledge.repository.not_found',
        subject: object.id,
      });
    }
    const head = versions[versions.length - 1]!;
    if (object.version <= head.version) {
      throw new KmosError(
        `New version (${object.version}) must exceed current head (${head.version})`,
        {
          category: 'Conflict',
          code: 'knowledge.repository.stale_version',
          subject: object.id,
          detail: { head: head.version, attempted: object.version },
        },
      );
    }
    versions.push(object);
  }

  head(id: CanonicalId): T | undefined {
    const versions = this.byId.get(id);
    return versions?.[versions.length - 1];
  }

  history(id: CanonicalId): readonly T[] {
    return this.byId.get(id) ?? [];
  }

  heads(): readonly T[] {
    const out: T[] = [];
    for (const versions of this.byId.values()) {
      const head = versions[versions.length - 1];
      if (head) out.push(head);
    }
    return out;
  }

  has(id: CanonicalId): boolean {
    return this.byId.has(id);
  }
}
