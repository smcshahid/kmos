/**
 * Archive Explorer (WP-20 / KMOS-0009 application).
 *
 * A thin experience layer over the institutional archive: it composes the Asset
 * Registry service (KMOS-0202) through its business API and presents
 * read-oriented views (asset detail, lineage graph, evidence review, version
 * timeline). It owns NO business logic and no canonical objects -- applications
 * are replaceable views over the system of record (KMOS-9999 §9, KMOS-0009).
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { AssetRegistryService, IntegrityResult } from '@kmos/assets';
import type {
  AssetObject,
  AssetVersionObject,
  EvidencePackageObject,
  ProvenanceObject,
} from '@kmos/assets';
import type { Derivation, LineageGraph } from '@kmos/assets';

export interface ArchiveExplorerOptions {
  readonly assets: AssetRegistryService;
}

/** Full read view of one archived asset: object + provenance + version history. */
export interface AssetView {
  readonly asset: AssetObject;
  readonly provenance: ProvenanceObject;
  readonly versionHistory: readonly AssetVersionObject[];
}

/** The reconstructed derivation graph, shaped for display. */
export interface LineageView {
  readonly assetId: CanonicalId;
  readonly ancestors: readonly CanonicalId[];
  readonly descendants: readonly CanonicalId[];
  readonly edges: readonly Derivation[];
}

/** Evidence review for an asset: integrity outcome, provenance, optional package. */
export interface EvidenceReview {
  readonly integrity: IntegrityResult;
  readonly provenance: ProvenanceObject;
  readonly evidencePackageId?: CanonicalId;
}

/** A single entry in the display timeline. */
export interface TimelineEntry {
  readonly versionId: CanonicalId;
  readonly ordinal: number;
  readonly reason: string;
  readonly checksum: string;
  readonly createdAt: string;
  readonly parentVersionId?: CanonicalId;
}

export class ArchiveExplorer {
  private readonly assets: AssetRegistryService;

  constructor(opts: ArchiveExplorerOptions) {
    this.assets = opts.assets;
  }

  /** Full read view of one asset: object + provenance + immutable version history. */
  getAssetView(assetId: CanonicalId): AssetView {
    return {
      asset: this.assets.getAsset(assetId),
      provenance: this.assets.getProvenance(assetId),
      versionHistory: this.assets.getVersionHistory(assetId),
    };
  }

  /** The reconstructed lineage graph (ancestors/descendants/edges), shaped for display. */
  lineageView(assetId: CanonicalId): LineageView {
    const graph: LineageGraph = this.assets.getLineage(assetId);
    return {
      assetId: graph.assetId,
      ancestors: graph.ancestors,
      descendants: graph.descendants,
      edges: graph.edges,
    };
  }

  /**
   * Evidence review: verify integrity, fetch provenance, and (by default) bundle
   * the chain of custody into an Evidence Package. Pass `bundle: false` to skip
   * generating a package and only return the integrity + provenance views.
   */
  async evidenceReview(
    assetId: CanonicalId,
    options: { readonly bundle?: boolean } = {},
  ): Promise<EvidenceReview> {
    const integrity = await this.assets.verifyIntegrity(assetId);
    const provenance = this.assets.getProvenance(assetId);
    const bundle = options.bundle ?? true;
    if (!bundle) return { integrity, provenance };
    const pkg: EvidencePackageObject = await this.assets.generateEvidencePackage(assetId);
    return { integrity, provenance, evidencePackageId: pkg.id };
  }

  /** Version history ordered (oldest first) for a display timeline. */
  timeline(assetId: CanonicalId): readonly TimelineEntry[] {
    return this.assets.getVersionHistory(assetId).map((v) => ({
      versionId: v.id,
      ordinal: v.body.ordinal,
      reason: v.body.reason,
      checksum: v.body.checksum,
      createdAt: v.createdAt,
      ...(v.body.parentVersionId !== undefined ? { parentVersionId: v.body.parentVersionId } : {}),
    }));
  }
}
