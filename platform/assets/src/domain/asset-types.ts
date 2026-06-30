/**
 * Asset Registry canonical bodies (KMOS-0202 §5, §11–§18; KMOS-0140; KMOS-10030 §14).
 *
 * The Asset Registry owns these canonical object types. Per the constitution
 * (§3) the common envelope, identifiers, lifecycle and event catalog come from
 * `@kmos/canonical-kernel`; this module only declares the object-type-specific
 * *bodies* the kernel does not interpret. These bodies are deliberately free of
 * any infrastructure or storage-technology detail (KMOS-0202 §6/§17): an Asset's
 * identity and metadata never depend on where its bytes live.
 */

import type { CanonicalId, CanonicalReference } from '@kmos/canonical-kernel';

/** Broad classes of digital artifact the registry preserves (KMOS-0202 §12). */
export type AssetType =
  | 'Video'
  | 'Audio'
  | 'Image'
  | 'Document'
  | 'Transcript'
  | 'Dataset'
  | 'KnowledgePackage'
  | 'Other';

/**
 * A logical storage reference (KMOS-0202 §5/§17). It names *where* the bytes
 * currently live behind the StoragePort. It is intentionally NOT part of Asset
 * identity: the registry references a logical storage id, and a migration may
 * change the reference without changing the Asset. `storageId` is the key passed
 * to the StoragePort; `backend` and `location` are descriptive only.
 */
export interface StorageReference {
  /** Logical id resolved by the StoragePort (never a real path/URL of record). */
  readonly storageId: string;
  /** Descriptive backend kind, e.g. "object", "filesystem", "archive", "cas". */
  readonly backend: string;
  /** Optional human-facing location hint (bucket/region/etc.); descriptive only. */
  readonly location?: string;
}

/** Technical/media characteristics — extensible metadata (KMOS-0202 §12). */
export interface MediaMetadata {
  readonly mediaType: string; // IANA media type, e.g. "video/mp4"
  readonly byteLength?: number;
  readonly durationSeconds?: number;
  readonly language?: string;
  readonly [key: string]: unknown; // metadata SHALL remain extensible
}

/**
 * An integrity record (KMOS-0202 §15). Records the checksum, the algorithm, when
 * it was verified, and the verification outcome. Stored as immutable history on
 * the Asset; corruption is recorded, never overwritten.
 */
export interface IntegrityRecord {
  readonly algorithm: string; // e.g. "sha256" (logical; adapter computes)
  readonly checksum: string;
  readonly verifiedAt: string; // ISO-8601
  readonly result: 'Verified' | 'Failed';
  readonly storageId: string;
  readonly note?: string;
}

/** The canonical Asset body (KMOS-0202 §11/§12/§15). */
export interface AssetBody {
  readonly assetType: AssetType;
  readonly media: MediaMetadata;
  readonly description?: string;
  readonly tags: readonly string[];
  /**
   * Current logical storage reference. Mutable across migrations; the Asset id
   * is NOT derived from it (KMOS-0202 §11 — identity survives storage change).
   */
  readonly currentStorage: StorageReference;
  /** Canonical id of the current (latest) AssetVersion. */
  readonly currentVersionId: CanonicalId;
  /** Canonical id of the Provenance object for this asset. */
  readonly provenanceId: CanonicalId;
  /** Canonical id of the Lineage object for this asset. */
  readonly lineageId: CanonicalId;
  /** Append-only integrity history (latest last). */
  readonly integrity: readonly IntegrityRecord[];
}

/**
 * An immutable AssetVersion (KMOS-0202 §16). Every modification creates a new
 * version that references its parent; historical versions remain accessible and
 * are never overwritten.
 */
export interface AssetVersionBody {
  readonly assetId: CanonicalId;
  /** 1-based ordinal within the version chain. */
  readonly ordinal: number;
  readonly reason: string;
  readonly checksum: string;
  readonly storage: StorageReference;
  /** Parent AssetVersion id; undefined for the first version. */
  readonly parentVersionId?: CanonicalId;
  /** Capability that produced this version (reproducibility, KMOS-0202 §13). */
  readonly capabilityId?: CanonicalId;
  readonly capabilityVersion?: string;
  readonly workflowId?: CanonicalId;
}

/** A single contributor (human or AI) to an asset's creation (KMOS-0202 §13). */
export interface Contributor {
  readonly kind: 'Human' | 'AI';
  readonly id: CanonicalId;
  readonly role?: string;
  /** For AI contributors: model/capability version, for reproducibility. */
  readonly version?: string;
}

/** Provenance: how an asset came to exist (KMOS-0202 §13). */
export interface ProvenanceBody {
  readonly assetId: CanonicalId;
  /** Origin / acquisition or creation method, e.g. "Ingested", "DerivedByCapability". */
  readonly origin: string;
  readonly originalSource?: string;
  readonly producingCapabilityId?: CanonicalId;
  readonly producingCapabilityVersion?: string;
  readonly workflowId?: CanonicalId;
  readonly workflowVersion?: string;
  /** Canonical ids of assets used as inputs (reproducibility, KMOS-0202 §13). */
  readonly sourceAssetIds: readonly CanonicalId[];
  readonly contributors: readonly Contributor[];
  readonly configuration?: Readonly<Record<string, unknown>>;
}

/**
 * A single derivation edge in the lineage graph (KMOS-0202 §14): an asset was
 * produced from one or more input assets by a transformation capability.
 */
export interface Derivation {
  readonly derivedAssetId: CanonicalId;
  readonly inputAssetIds: readonly CanonicalId[];
  readonly transformationCapabilityId?: CanonicalId;
  readonly transformationCapabilityVersion?: string;
  readonly workflowId?: CanonicalId;
  readonly at: string; // ISO-8601
}

/** Lineage for a single asset (KMOS-0202 §14). */
export interface LineageBody {
  readonly assetId: CanonicalId;
  /** Direct parents (assets this asset was derived from). */
  readonly parentAssetIds: readonly CanonicalId[];
  /** Direct children (assets derived from this asset). */
  readonly derivedAssetIds: readonly CanonicalId[];
  /** The derivation that produced THIS asset, if it is derived. */
  readonly producedBy?: Derivation;
}

/** The reconstructed, multi-hop derivation graph for an asset (KMOS-0202 §14). */
export interface LineageGraph {
  readonly assetId: CanonicalId;
  /** All transitive ancestors (closest first is not guaranteed; set semantics). */
  readonly ancestors: readonly CanonicalId[];
  /** All transitive descendants. */
  readonly descendants: readonly CanonicalId[];
  /** Every derivation edge reachable from this asset (ancestry + descent). */
  readonly edges: readonly Derivation[];
}

/** An Evidence Package bundling everything needed to verify an asset (KMOS-0202 §18). */
export interface EvidencePackageBody {
  readonly assetId: CanonicalId;
  readonly assetVersionIds: readonly CanonicalId[];
  readonly provenanceId: CanonicalId;
  readonly lineageId: CanonicalId;
  readonly lineage: LineageGraph;
  readonly integrity: readonly IntegrityRecord[];
  /** By-identifier references to related events, knowledge, approvals, etc. */
  readonly references: readonly CanonicalReference[];
  readonly generatedAt: string;
}
