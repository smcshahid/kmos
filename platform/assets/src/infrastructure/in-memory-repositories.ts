/**
 * In-memory repository adapters (KMOS-0202 §7; modular-monolith-first).
 *
 * Zero-dependency reference implementations of the repository ports. They keep
 * canonical objects in Maps; version history is append-only and never mutated in
 * place (KMOS-0202 §16). A Postgres adapter implements the same ports later.
 */

import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';
import type {
  AssetObject,
  AssetRepository,
  AssetVersionObject,
  AssetVersionRepository,
  EvidencePackageObject,
  EvidencePackageRepository,
  LineageObject,
  LineageRepository,
  ProvenanceObject,
  ProvenanceRepository,
  Repository,
} from '../domain/repositories.js';

class InMemoryRepository<T extends CanonicalObject> implements Repository<T> {
  protected readonly byId = new Map<CanonicalId, T>();

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

export class InMemoryAssetRepository
  extends InMemoryRepository<AssetObject>
  implements AssetRepository {}

export class InMemoryAssetVersionRepository
  extends InMemoryRepository<AssetVersionObject>
  implements AssetVersionRepository
{
  /** Insertion order preserves ordinal order; the Map keeps insertion order. */
  forAsset(assetId: CanonicalId): readonly AssetVersionObject[] {
    return this.list()
      .filter((v) => v.body.assetId === assetId)
      .sort((a, b) => a.body.ordinal - b.body.ordinal);
  }
}

export class InMemoryProvenanceRepository
  extends InMemoryRepository<ProvenanceObject>
  implements ProvenanceRepository {}

export class InMemoryLineageRepository
  extends InMemoryRepository<LineageObject>
  implements LineageRepository {}

export class InMemoryEvidencePackageRepository
  extends InMemoryRepository<EvidencePackageObject>
  implements EvidencePackageRepository {}
