/**
 * Repository ports + in-memory adapters (KMOS-0206; ports-and-adapters).
 *
 * Persistence is an infrastructure concern, so each canonical object type the
 * Identity Service owns is stored behind a generic CanonicalRepository PORT. The
 * application core depends on the interface only; a Postgres adapter can later
 * implement the same interface without touching the service. History is kept by
 * storing whole canonical-object versions (callers append new versions rather
 * than mutating in place).
 */

import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';

/** A generic store for canonical objects of one type, keyed by canonical id. */
export interface CanonicalRepository<T extends CanonicalObject> {
  put(obj: T): void;
  get(id: CanonicalId): T | undefined;
  list(): readonly T[];
  has(id: CanonicalId): boolean;
}

export class InMemoryRepository<T extends CanonicalObject> implements CanonicalRepository<T> {
  private readonly byId = new Map<CanonicalId, T>();

  put(obj: T): void {
    this.byId.set(obj.id, obj);
  }

  get(id: CanonicalId): T | undefined {
    return this.byId.get(id);
  }

  list(): readonly T[] {
    return [...this.byId.values()];
  }

  has(id: CanonicalId): boolean {
    return this.byId.has(id);
  }
}
