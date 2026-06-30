/**
 * Repository PORTS (KMOS-0202 §7; constitution §1/§2).
 *
 * The application core persists canonical objects through these interfaces only.
 * In-memory adapters live in `infrastructure/`; a Postgres adapter would
 * implement the same ports without touching the application. Repositories store
 * canonical objects by id and (for versions) preserve immutable history.
 */

import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';
import type {
  AssetBody,
  AssetVersionBody,
  ProvenanceBody,
  LineageBody,
  EvidencePackageBody,
} from './asset-types.js';

export type AssetObject = CanonicalObject<AssetBody>;
export type AssetVersionObject = CanonicalObject<AssetVersionBody>;
export type ProvenanceObject = CanonicalObject<ProvenanceBody>;
export type LineageObject = CanonicalObject<LineageBody>;
export type EvidencePackageObject = CanonicalObject<EvidencePackageBody>;

/** Generic by-id repository for a canonical object type. */
export interface Repository<T extends CanonicalObject> {
  put(obj: T): void;
  get(id: CanonicalId): T | undefined;
  list(): readonly T[];
}

export interface AssetRepository extends Repository<AssetObject> {}

/** Versions are immutable and appended; history is never overwritten. */
export interface AssetVersionRepository extends Repository<AssetVersionObject> {
  /** All versions for an asset, in insertion (ordinal) order. */
  forAsset(assetId: CanonicalId): readonly AssetVersionObject[];
}

export interface ProvenanceRepository extends Repository<ProvenanceObject> {}
export interface LineageRepository extends Repository<LineageObject> {}
export interface EvidencePackageRepository extends Repository<EvidencePackageObject> {}
