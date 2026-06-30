/**
 * Preservation domain service (KMOS-0006 Asset Registry framework §18,
 * KMOS-0009 Preservation Platform).
 *
 * A DOMAIN composes platform capabilities into a business solution and holds no
 * business logic of its own beyond the orchestration of those capabilities
 * (constitution §1). Preservation orchestrates the Asset Registry: it verifies
 * the integrity of each asset, bundles an immutable Evidence Package for each,
 * and transitions verified assets toward the canonical `Preserved` lifecycle.
 *
 * Reproducibility (KMOS-0006 §18): the result returned by `preserve` is itself a
 * reproducibility record. It carries, per asset, the reconstructed lineage
 * graph, the integrity verification outcome, and the id of the evidence package,
 * so that a future system can reconstruct exactly what was preserved and verify
 * it independently — without trusting this service or its storage.
 *
 * It composes the Asset Registry through the injected AssetRegistryService, a
 * shared EventBus, and an injected clock; it adds NO new runtime dependency and
 * owns no canonical objects (those belong to the Asset Registry).
 */

import {
  EventBus,
  canTransition,
  createEvent,
  type CanonicalId,
  type LifecycleState,
} from '@kmos/canonical-kernel';
import type {
  AssetRegistryService,
  IntegrityResult,
  LineageGraph,
} from '@kmos/assets';

const PRODUCER = 'PreservationDomain';
const TARGET_STATE: LifecycleState = 'Preserved';

export interface PreservationDomainOptions {
  readonly bus: EventBus;
  readonly assets: AssetRegistryService;
  readonly now?: () => string;
}

export interface PreserveInput {
  readonly assetIds: readonly CanonicalId[];
  readonly organizationId?: CanonicalId;
}

/**
 * The per-asset preservation outcome (KMOS-0006 §18 reproducibility record).
 * `preserved` is false for assets that failed integrity; such assets are never
 * transitioned to `Preserved`.
 */
export interface PreservedAssetSummary {
  readonly assetId: CanonicalId;
  /** Integrity verification outcome (recomputed checksum vs. recorded). */
  readonly integrity: IntegrityResult;
  /** Whether the asset reached the canonical `Preserved` lifecycle state. */
  readonly preserved: boolean;
  /** Final lifecycle state of the asset after the attempt. */
  readonly lifecycle: LifecycleState;
  /** Evidence package id bundling versions, provenance, lineage and integrity. */
  readonly evidencePackageId?: CanonicalId;
  /** Reconstructed multi-hop lineage graph (reproducibility). */
  readonly lineage: LineageGraph;
}

export interface PreserveResult {
  /** Per-asset reproducibility records (KMOS-0006 §18). */
  readonly assets: readonly PreservedAssetSummary[];
  /** Evidence package ids produced (one per asset that was bundled). */
  readonly evidencePackageIds: readonly CanonicalId[];
  /** Integrity results for every asset, including failures. */
  readonly integrity: readonly IntegrityResult[];
  /** Asset ids that reached the `Preserved` lifecycle state. */
  readonly preservedAssetIds: readonly CanonicalId[];
  /** Asset ids that failed integrity and were NOT preserved. */
  readonly failedAssetIds: readonly CanonicalId[];
}

export class PreservationDomainService {
  private readonly bus: EventBus;
  private readonly assets: AssetRegistryService;
  private readonly now: () => string;

  constructor(opts: PreservationDomainOptions) {
    this.bus = opts.bus;
    this.assets = opts.assets;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  /**
   * Preserve a set of assets (KMOS-0006 §18, KMOS-0009). For each asset, this
   * (1) verifies integrity via the Asset Registry, (2) generates an Evidence
   * Package bundling its versions, provenance, reconstructed lineage and
   * integrity history, (3) transitions the asset toward `Preserved` honoring the
   * canonical lifecycle graph, and (4) on success emits `PreservationCompleted`.
   *
   * An asset that fails integrity is reported as a failure and is NOT marked
   * `Preserved`; corruption is surfaced, never silently preserved.
   */
  async preserve(input: PreserveInput): Promise<PreserveResult> {
    const summaries: PreservedAssetSummary[] = [];
    const evidencePackageIds: CanonicalId[] = [];
    const integrity: IntegrityResult[] = [];
    const preservedAssetIds: CanonicalId[] = [];
    const failedAssetIds: CanonicalId[] = [];

    for (const assetId of input.assetIds) {
      // (1) Verify integrity (Asset Registry recomputes the checksum).
      const integrityResult = await this.assets.verifyIntegrity(assetId);
      integrity.push(integrityResult);

      // Reconstruct lineage for the reproducibility record (KMOS-0006 §18).
      const lineage = this.assets.getLineage(assetId);

      if (!integrityResult.ok) {
        // Failure: report it; do NOT bundle evidence as "preserved" and do NOT
        // transition the asset's lifecycle to Preserved.
        const asset = this.assets.getAsset(assetId);
        failedAssetIds.push(assetId);
        summaries.push({
          assetId,
          integrity: integrityResult,
          preserved: false,
          lifecycle: asset.lifecycle,
          lineage,
        });
        continue;
      }

      // (2) Generate the Evidence Package bundling this asset.
      const evidence = await this.assets.generateEvidencePackage(assetId);
      evidencePackageIds.push(evidence.id);

      // (3) Transition toward Preserved, honoring canTransition.
      const finalState = await this.advanceToPreserved(assetId);
      const preserved = finalState === TARGET_STATE;
      if (preserved) preservedAssetIds.push(assetId);

      summaries.push({
        assetId,
        integrity: integrityResult,
        preserved,
        lifecycle: finalState,
        evidencePackageId: evidence.id,
        lineage,
      });

      // (4) Emit PreservationCompleted for the successfully preserved asset.
      if (preserved) {
        await this.emit(
          'PreservationCompleted',
          assetId,
          {
            assetId,
            evidencePackageId: evidence.id,
            integrityResult: integrityResult.record.result,
            algorithm: integrityResult.record.algorithm,
            lineageAncestors: lineage.ancestors,
            lineageDescendants: lineage.descendants,
          },
          input.organizationId,
        );
      }
    }

    return {
      assets: summaries,
      evidencePackageIds,
      integrity,
      preservedAssetIds,
      failedAssetIds,
    };
  }

  /**
   * Walk the canonical lifecycle from the asset's current state to `Preserved`,
   * taking only transitions permitted by `canTransition`. The canonical graph
   * has no single-hop edge from `Created` to `Preserved`, so this routes via the
   * shortest permitted path (e.g. Created -> Archived -> Preserved). Returns the
   * final state actually reached (which is `Preserved` on success).
   */
  private async advanceToPreserved(assetId: CanonicalId): Promise<LifecycleState> {
    let current = this.assets.getAsset(assetId).lifecycle;
    const visited = new Set<LifecycleState>([current]);

    while (current !== TARGET_STATE) {
      const next = this.nextStepToward(current, TARGET_STATE, visited);
      if (next === undefined) break; // no permitted path forward
      const updated = await this.assets.transitionLifecycle(assetId, next);
      current = updated.lifecycle;
      visited.add(current);
    }
    return current;
  }

  /**
   * Breadth-first search over the canonical lifecycle graph for the next step on
   * a shortest path from `from` to `to`, skipping already-visited states to
   * avoid cycles (e.g. Archived <-> Active).
   */
  private nextStepToward(
    from: LifecycleState,
    to: LifecycleState,
    visited: ReadonlySet<LifecycleState>,
  ): LifecycleState | undefined {
    // Route through "live" states only: never pass through Archived or Retired
    // on the way to Preserved. Transitioning out of Archived would emit an
    // AssetRestored event (an Asset Registry-local event), and Retired is a
    // dead end — so the canonical path we take is Created -> Active -> Approved
    // -> Preserved, which emits only AssetUpdated events.
    const candidates: readonly LifecycleState[] = [
      'Created', 'Validated', 'Active', 'Updated', 'Reviewed',
      'Approved', 'Published', 'Preserved',
    ];
    // BFS recording the first step taken from `from`.
    const queue: LifecycleState[] = [];
    const firstStep = new Map<LifecycleState, LifecycleState>();
    for (const c of candidates) {
      if (c !== from && canTransition(from, c) && !visited.has(c)) {
        queue.push(c);
        firstStep.set(c, c);
      }
    }
    const seen = new Set<LifecycleState>([from, ...queue]);
    while (queue.length > 0) {
      const node = queue.shift() as LifecycleState;
      if (node === to) return firstStep.get(node);
      for (const c of candidates) {
        if (!seen.has(c) && canTransition(node, c)) {
          seen.add(c);
          firstStep.set(c, firstStep.get(node) as LifecycleState);
          queue.push(c);
        }
      }
    }
    return undefined;
  }

  private async emit(
    type: string,
    subjectId: CanonicalId,
    payload: Record<string, unknown>,
    organizationId?: CanonicalId,
  ): Promise<void> {
    const ev = createEvent({
      type,
      schemaVersion: '1.0',
      producer: PRODUCER,
      subjectId,
      payload,
      time: this.now(),
      ...(organizationId !== undefined ? { organizationId } : {}),
    });
    await this.bus.publish(ev, { streamId: subjectId });
  }
}
