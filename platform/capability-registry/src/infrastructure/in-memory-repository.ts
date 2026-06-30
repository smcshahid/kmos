/** In-memory repository adapter (modular-monolith-first; Postgres adapter later). */
import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';

export interface Repository<T extends CanonicalObject> {
  put(obj: T): void;
  get(id: CanonicalId): T | undefined;
  list(): readonly T[];
}

export class InMemoryRepository<T extends CanonicalObject> implements Repository<T> {
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
}
