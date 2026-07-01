/**
 * Asset Registry Service application layer (KMOS-0202).
 *
 * The authoritative system of record for every digital Asset (KMOS-0202 §1).
 * It owns the canonical objects Asset, AssetVersion, Provenance, Lineage and
 * EvidencePackage (plus IntegrityRecord and StorageReference embedded in them),
 * with owner 'AssetRegistry'. It orchestrates the domain through repository,
 * storage and checksum PORTS (constitution §1/§2) and publishes a canonical
 * event for every meaningful change (constitution §5).
 *
 * Identity is permanent and independent of storage (KMOS-0202 §11): the Asset id
 * is a fresh canonical id, never derived from a storage id, filename or path,
 * and `updateStorageReference` repoints storage without changing identity.
 * Versions are immutable (KMOS-0202 §16): every change appends a new
 * AssetVersion that links to its parent; history is never overwritten.
 */

import {
  EventBus,
  EventCatalog,
  KmosError,
  canTransition,
  createCanonicalObject,
  createEvent,
  newCanonicalId,
  type CanonicalEvent,
  type CanonicalId,
  type CanonicalObject,
  type CanonicalReference,
  type LifecycleState,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import type {
  AssetType,
  Contributor,
  Derivation,
  IntegrityRecord,
  LineageGraph,
  MediaMetadata,
  StorageReference,
} from '../domain/asset-types.js';
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
} from '../domain/repositories.js';
import type { StoragePort } from '../domain/storage-port.js';
import type { ChecksumPort } from '../domain/checksum-port.js';
import {
  InMemoryAssetRepository,
  InMemoryAssetVersionRepository,
  InMemoryEvidencePackageRepository,
  InMemoryLineageRepository,
  InMemoryProvenanceRepository,
} from '../infrastructure/in-memory-repositories.js';
import { InMemoryStorageAdapter } from '../infrastructure/in-memory-storage-adapter.js';
import { Sha256ChecksumAdapter } from '../infrastructure/sha256-checksum-adapter.js';

const SCHEMA_VERSION = '1.0';
const PRODUCER = 'AssetRegistry';

/** De-duplicate a list of canonical identifiers, preserving first-seen order. */
function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * Extra Asset events not in the kernel seed but listed in KMOS-0202 §9. We do
 * NOT mutate the kernel catalog; instead we build a LOCAL catalog from the
 * kernel's seed plus these and feed it to the default bus (KMOS-9999 §7).
 */
const EXTRA_EVENT_TYPES = ['AssetRestored', 'StorageMigrated'] as const;

function buildAssetCatalog(): EventCatalog {
  // Kernel is the authoritative catalog (MED-5); these types now live in the
  // kernel seed. Registration is idempotent and kept for API compatibility.
  const catalog = new EventCatalog(); // seeded with the full kernel families
  for (const type of EXTRA_EVENT_TYPES) {
    if (catalog.has(type)) continue;
    catalog.register({
      type,
      owner: 'AssetRegistry',
      eventClass: 'Institutional',
      schemaVersion: SCHEMA_VERSION,
      category: 'Asset',
    });
  }
  return catalog;
}

export interface AssetRegistryOptions {
  /** Injected bus; defaults to one bound to a catalog with the extra Asset events. */
  readonly bus?: EventBus;
  /** Deterministic clock (tests/replay); defaults to wall clock. */
  readonly now?: () => string;
  readonly storage?: StoragePort;
  readonly checksum?: ChecksumPort;
  readonly assets?: AssetRepository;
  readonly versions?: AssetVersionRepository;
  readonly provenance?: ProvenanceRepository;
  readonly lineage?: LineageRepository;
  readonly evidence?: EvidencePackageRepository;
}

export interface RegisterAssetInput {
  readonly assetType: AssetType;
  readonly mediaType: string;
  readonly displayName: string;
  readonly organizationId?: CanonicalId;
  readonly storageRef: StorageReference;
  readonly checksum: string;
  readonly provenance: ProvenanceInput;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly media?: Partial<MediaMetadata>;
  /** Optional bytes to persist so integrity can later be recomputed. */
  readonly content?: Uint8Array;
}

export interface ProvenanceInput {
  readonly origin: string;
  readonly originalSource?: string;
  readonly producingCapabilityId?: CanonicalId;
  readonly producingCapabilityVersion?: string;
  readonly workflowId?: CanonicalId;
  readonly workflowVersion?: string;
  readonly sourceAssetIds?: readonly CanonicalId[];
  readonly contributors?: readonly Contributor[];
  readonly configuration?: Readonly<Record<string, unknown>>;
}

export interface CreateVersionInput {
  readonly reason: string;
  readonly checksum: string;
  readonly storageRef: StorageReference;
  readonly parentVersion?: CanonicalId;
  readonly capabilityId?: CanonicalId;
  readonly capabilityVersion?: string;
  readonly workflowId?: CanonicalId;
  readonly content?: Uint8Array;
}

export interface RecordDerivationInput {
  readonly derivedAssetId: CanonicalId;
  readonly inputAssetIds: readonly CanonicalId[];
  readonly transformationCapabilityId?: CanonicalId;
  readonly transformationCapabilityVersion?: string;
  readonly workflowId?: CanonicalId;
}

export interface IntegrityResult {
  readonly assetId: CanonicalId;
  readonly ok: boolean;
  readonly record: IntegrityRecord;
}

export class AssetRegistryService {
  private readonly bus: EventBus;
  private readonly now: () => string;
  private readonly storage: StoragePort;
  private readonly checksum: ChecksumPort;
  private readonly assets: AssetRepository;
  private readonly versions: AssetVersionRepository;
  private readonly provenance: ProvenanceRepository;
  private readonly lineage: LineageRepository;
  private readonly evidence: EvidencePackageRepository;

  constructor(options: AssetRegistryOptions = {}) {
    this.bus = options.bus ?? new EventBus({ catalog: buildAssetCatalog() });
    this.now = options.now ?? (() => new Date().toISOString());
    this.storage = options.storage ?? new InMemoryStorageAdapter();
    this.checksum = options.checksum ?? new Sha256ChecksumAdapter();
    this.assets = options.assets ?? new InMemoryAssetRepository();
    this.versions = options.versions ?? new InMemoryAssetVersionRepository();
    this.provenance = options.provenance ?? new InMemoryProvenanceRepository();
    this.lineage = options.lineage ?? new InMemoryLineageRepository();
    this.evidence = options.evidence ?? new InMemoryEvidencePackageRepository();
  }

  /** Underlying bus, for in-monolith wiring/inspection. */
  get eventBus(): EventBus {
    return this.bus;
  }

  // ----------------------------------------------------------------- Register

  /**
   * Register a new Asset (KMOS-0202 §8 Register Asset). The returned Asset has a
   * canonical identity that is INDEPENDENT of its storage reference: the id is a
   * fresh `kmos:Asset:<uuid>`, never derived from storageRef/filename/path
   * (KMOS-0202 §11). The first immutable AssetVersion, Provenance and Lineage
   * objects are created and linked.
   */
  async registerAsset(input: RegisterAssetInput): Promise<AssetObject> {
    const now = this.now();
    const assetId = newCanonicalId('Asset');

    if (input.content !== undefined) {
      await this.storage.put(input.storageRef.storageId, { bytes: input.content });
    }

    // First immutable version.
    const version = createCanonicalObject<AssetVersionObject['body']>({
      id: newCanonicalId('AssetVersion'),
      type: 'AssetVersion',
      schemaVersion: SCHEMA_VERSION,
      owner: 'AssetRegistry',
      lifecycle: 'Active',
      now,
      body: {
        assetId,
        ordinal: 1,
        reason: 'initial registration',
        checksum: input.checksum,
        storage: input.storageRef,
        ...(input.provenance.producingCapabilityId !== undefined
          ? { capabilityId: input.provenance.producingCapabilityId }
          : {}),
        ...(input.provenance.producingCapabilityVersion !== undefined
          ? { capabilityVersion: input.provenance.producingCapabilityVersion }
          : {}),
        ...(input.provenance.workflowId !== undefined
          ? { workflowId: input.provenance.workflowId }
          : {}),
      },
    });
    this.versions.put(version);

    // Provenance.
    const provenance = createCanonicalObject<ProvenanceObject['body']>({
      id: newCanonicalId('Provenance'),
      type: 'Provenance',
      schemaVersion: SCHEMA_VERSION,
      owner: 'AssetRegistry',
      lifecycle: 'Active',
      now,
      body: {
        assetId,
        origin: input.provenance.origin,
        ...(input.provenance.originalSource !== undefined
          ? { originalSource: input.provenance.originalSource }
          : {}),
        ...(input.provenance.producingCapabilityId !== undefined
          ? { producingCapabilityId: input.provenance.producingCapabilityId }
          : {}),
        ...(input.provenance.producingCapabilityVersion !== undefined
          ? { producingCapabilityVersion: input.provenance.producingCapabilityVersion }
          : {}),
        ...(input.provenance.workflowId !== undefined ? { workflowId: input.provenance.workflowId } : {}),
        ...(input.provenance.workflowVersion !== undefined
          ? { workflowVersion: input.provenance.workflowVersion }
          : {}),
        sourceAssetIds: input.provenance.sourceAssetIds ?? [],
        contributors: input.provenance.contributors ?? [],
        ...(input.provenance.configuration !== undefined
          ? { configuration: input.provenance.configuration }
          : {}),
      },
    });
    this.provenance.put(provenance);

    // Lineage: parents come from provenance source assets.
    const parents = input.provenance.sourceAssetIds ?? [];
    const lineage = createCanonicalObject<LineageObject['body']>({
      id: newCanonicalId('Lineage'),
      type: 'Lineage',
      schemaVersion: SCHEMA_VERSION,
      owner: 'AssetRegistry',
      lifecycle: 'Active',
      now,
      body: { assetId, parentAssetIds: parents, derivedAssetIds: [] },
    });
    this.lineage.put(lineage);

    const media: MediaMetadata = { mediaType: input.mediaType, ...(input.media ?? {}) };
    const relationships: CanonicalReference[] = [
      { relation: 'hasVersion', targetId: version.id, targetType: 'AssetVersion' },
      { relation: 'hasProvenance', targetId: provenance.id, targetType: 'Provenance' },
      { relation: 'hasLineage', targetId: lineage.id, targetType: 'Lineage' },
    ];

    const asset = createCanonicalObject<AssetObject['body']>({
      id: assetId,
      type: 'Asset',
      schemaVersion: SCHEMA_VERSION,
      owner: 'AssetRegistry',
      lifecycle: 'Created',
      displayName: input.displayName,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      relationships,
      now,
      body: {
        assetType: input.assetType,
        media,
        ...(input.description !== undefined ? { description: input.description } : {}),
        tags: input.tags ?? [],
        currentStorage: input.storageRef,
        currentVersionId: version.id,
        provenanceId: provenance.id,
        lineageId: lineage.id,
        integrity: [],
      },
    });
    this.assets.put(asset);

    // If this asset derives from sources, record those derivation edges too.
    if (parents.length > 0) {
      this.applyDerivation(
        {
          derivedAssetId: assetId,
          inputAssetIds: parents,
          ...(input.provenance.producingCapabilityId !== undefined
            ? { transformationCapabilityId: input.provenance.producingCapabilityId }
            : {}),
          ...(input.provenance.producingCapabilityVersion !== undefined
            ? { transformationCapabilityVersion: input.provenance.producingCapabilityVersion }
            : {}),
          ...(input.provenance.workflowId !== undefined ? { workflowId: input.provenance.workflowId } : {}),
        },
        now,
      );
    }

    // State-carried snapshots (ADR read-model recovery): every repo-backed object
    // created/mutated by registration travels on the event so hydrate() can
    // rebuild the asset, its version chain, provenance and lineage (including
    // parent lineages touched by applyDerivation) byte-identically after restart.
    const registeredObjects: CanonicalObject[] = [
      asset,
      version,
      provenance,
      this.lineage.get(lineage.id) ?? lineage,
    ];
    for (const parentId of parents) {
      const parentLineage = this.lineageOf(parentId);
      if (parentLineage) registeredObjects.push(parentLineage);
    }

    await this.publish('AssetRegistered', assetId, asset.organizationId, {
      assetId,
      assetType: input.assetType,
      mediaType: input.mediaType,
      versionId: version.id,
      provenanceId: provenance.id,
      lineageId: lineage.id,
      object: asset,
      objects: registeredObjects,
    });

    return asset;
  }

  // ------------------------------------------------------------------- Reads

  getAsset(assetId: CanonicalId): AssetObject {
    return this.requireAsset(assetId);
  }

  getVersion(versionId: CanonicalId): AssetVersionObject | undefined {
    return this.versions.get(versionId);
  }

  /** Full immutable version chain for an asset, oldest first (KMOS-0202 §16). */
  getVersionHistory(assetId: CanonicalId): readonly AssetVersionObject[] {
    this.requireAsset(assetId);
    return this.versions.forAsset(assetId);
  }

  getProvenance(assetId: CanonicalId): ProvenanceObject {
    const asset = this.requireAsset(assetId);
    const p = this.provenance.get(asset.body.provenanceId);
    if (!p) throw this.notFound('Provenance', asset.body.provenanceId);
    return p;
  }

  // --------------------------------------------------------------- Metadata

  /** Update mutable business metadata. Identity and history are untouched. */
  async updateMetadata(
    assetId: CanonicalId,
    patch: { displayName?: string; description?: string; tags?: readonly string[]; media?: Partial<MediaMetadata> },
  ): Promise<AssetObject> {
    const asset = this.requireAsset(assetId);
    const updated = this.reviseAsset(asset, {
      ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
      body: {
        ...asset.body,
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.media !== undefined ? { media: { ...asset.body.media, ...patch.media } } : {}),
      },
    });
    this.assets.put(updated);
    await this.publish('AssetUpdated', assetId, asset.organizationId, {
      assetId,
      fields: Object.keys(patch),
      object: updated,
      objects: [updated],
    });
    return updated;
  }

  /**
   * Repoint an Asset to a new storage reference WITHOUT changing its identity
   * (KMOS-0202 §11/§17). Publishes StorageMigrated. The Asset id, versions,
   * provenance and lineage are all preserved.
   */
  async updateStorageReference(assetId: CanonicalId, storageRef: StorageReference): Promise<AssetObject> {
    const asset = this.requireAsset(assetId);
    const previous = asset.body.currentStorage;
    const updated = this.reviseAsset(asset, { body: { ...asset.body, currentStorage: storageRef } });
    this.assets.put(updated);
    await this.publish('StorageMigrated', assetId, asset.organizationId, {
      assetId,
      from: previous.storageId,
      to: storageRef.storageId,
      object: updated,
      objects: [updated],
    });
    return updated;
  }

  // --------------------------------------------------------------- Versions

  /**
   * Create a new immutable AssetVersion (KMOS-0202 §16). The new version links
   * to its parent (the asset's current version by default, or `parentVersion`);
   * prior versions are never overwritten. The asset's currentVersionId and
   * currentStorage advance, but its identity is unchanged.
   */
  async createVersion(assetId: CanonicalId, input: CreateVersionInput): Promise<AssetVersionObject> {
    const asset = this.requireAsset(assetId);
    const now = this.now();
    const parentId = input.parentVersion ?? asset.body.currentVersionId;
    const parent = this.versions.get(parentId);
    if (!parent) throw this.notFound('AssetVersion', parentId);

    if (input.content !== undefined) {
      await this.storage.put(input.storageRef.storageId, { bytes: input.content });
    }

    const ordinal = this.versions.forAsset(assetId).length + 1;
    const version = createCanonicalObject<AssetVersionObject['body']>({
      id: newCanonicalId('AssetVersion'),
      type: 'AssetVersion',
      schemaVersion: SCHEMA_VERSION,
      owner: 'AssetRegistry',
      lifecycle: 'Active',
      now,
      body: {
        assetId,
        ordinal,
        reason: input.reason,
        checksum: input.checksum,
        storage: input.storageRef,
        parentVersionId: parentId,
        ...(input.capabilityId !== undefined ? { capabilityId: input.capabilityId } : {}),
        ...(input.capabilityVersion !== undefined ? { capabilityVersion: input.capabilityVersion } : {}),
        ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
      },
    });
    this.versions.put(version);

    const updated = this.reviseAsset(asset, {
      lifecycle: 'Updated',
      body: { ...asset.body, currentVersionId: version.id, currentStorage: input.storageRef },
      relationships: [
        ...asset.relationships,
        { relation: 'hasVersion', targetId: version.id, targetType: 'AssetVersion' },
      ],
    });
    this.assets.put(updated);

    await this.publish('AssetVersionCreated', assetId, asset.organizationId, {
      assetId,
      versionId: version.id,
      ordinal,
      parentVersionId: parentId,
      reason: input.reason,
      object: version,
      objects: [version, updated],
    });
    return version;
  }

  // ---------------------------------------------------------------- Lineage

  /**
   * Record a derivation edge (KMOS-0202 §14): `derivedAssetId` was produced from
   * `inputAssetIds` by a transformation capability. Updates both the derived
   * asset's parents and each input's derivedAssetIds, and publishes
   * LineageUpdated.
   */
  async recordDerivation(input: RecordDerivationInput): Promise<LineageObject> {
    this.requireAsset(input.derivedAssetId);
    for (const inputId of input.inputAssetIds) this.requireAsset(inputId);
    const now = this.now();
    const lineage = this.applyDerivation(input, now);
    // Carry every lineage object mutated by this derivation (the derived asset's
    // lineage plus each input's), so getLineage recovers identically post-restart.
    const mutatedLineages: CanonicalObject[] = [lineage];
    for (const inputId of input.inputAssetIds) {
      const inputLineage = this.lineageOf(inputId);
      if (inputLineage) mutatedLineages.push(inputLineage);
    }
    await this.publish('LineageUpdated', input.derivedAssetId, undefined, {
      assetId: input.derivedAssetId,
      inputAssetIds: input.inputAssetIds,
      ...(input.transformationCapabilityId !== undefined
        ? { transformationCapabilityId: input.transformationCapabilityId }
        : {}),
      object: lineage,
      objects: mutatedLineages,
    });
    return lineage;
  }

  /**
   * Reconstruct the full derivation graph for an asset (KMOS-0202 §14):
   * all transitive ancestors and descendants, plus every derivation edge that
   * connects them. Supports multi-hop chains (video -> audio -> transcript ->
   * knowledge).
   */
  getLineage(assetId: CanonicalId): LineageGraph {
    this.requireAsset(assetId);

    const ancestors = new Set<CanonicalId>();
    const descendants = new Set<CanonicalId>();
    const edges = new Map<CanonicalId, Derivation>();

    const addEdge = (d: Derivation | undefined): void => {
      if (d) edges.set(d.derivedAssetId, d);
    };

    // Walk ancestors (parents-of-parents).
    const upStack: CanonicalId[] = [assetId];
    const upSeen = new Set<CanonicalId>();
    while (upStack.length > 0) {
      const current = upStack.pop() as CanonicalId;
      if (upSeen.has(current)) continue;
      upSeen.add(current);
      const node = this.lineageOf(current);
      if (!node) continue;
      addEdge(node.body.producedBy);
      for (const parent of node.body.parentAssetIds) {
        if (parent !== assetId) ancestors.add(parent);
        upStack.push(parent);
      }
    }

    // Walk descendants (children-of-children).
    const downStack: CanonicalId[] = [assetId];
    const downSeen = new Set<CanonicalId>();
    while (downStack.length > 0) {
      const current = downStack.pop() as CanonicalId;
      if (downSeen.has(current)) continue;
      downSeen.add(current);
      const node = this.lineageOf(current);
      if (!node) continue;
      for (const child of node.body.derivedAssetIds) {
        if (child !== assetId) descendants.add(child);
        const childNode = this.lineageOf(child);
        addEdge(childNode?.body.producedBy);
        downStack.push(child);
      }
    }

    return {
      assetId,
      ancestors: [...ancestors],
      descendants: [...descendants],
      edges: [...edges.values()],
    };
  }

  // -------------------------------------------------------------- Integrity

  /**
   * Verify an asset's integrity (KMOS-0202 §15): recompute the checksum of the
   * current stored bytes and compare it to the recorded checksum of the current
   * version. Appends an immutable IntegrityRecord and publishes IntegrityVerified
   * or IntegrityFailed.
   */
  async verifyIntegrity(assetId: CanonicalId): Promise<IntegrityResult> {
    const asset = this.requireAsset(assetId);
    const version = this.versions.get(asset.body.currentVersionId);
    if (!version) throw this.notFound('AssetVersion', asset.body.currentVersionId);
    const now = this.now();
    const storageId = asset.body.currentStorage.storageId;

    const content = await this.storage.get(storageId);
    let ok: boolean;
    let note: string | undefined;
    if (content === undefined) {
      ok = false;
      note = 'stored content not found';
    } else {
      const actual = this.checksum.compute(content.bytes);
      ok = actual === version.body.checksum;
      if (!ok) note = `checksum mismatch: expected ${version.body.checksum}, got ${actual}`;
    }

    const record: IntegrityRecord = {
      algorithm: this.checksum.algorithm,
      checksum: version.body.checksum,
      verifiedAt: now,
      result: ok ? 'Verified' : 'Failed',
      storageId,
      ...(note !== undefined ? { note } : {}),
    };

    const updated = this.reviseAsset(asset, {
      body: { ...asset.body, integrity: [...asset.body.integrity, record] },
    });
    this.assets.put(updated);

    await this.publish(ok ? 'IntegrityVerified' : 'IntegrityFailed', assetId, asset.organizationId, {
      assetId,
      versionId: version.id,
      algorithm: record.algorithm,
      result: record.result,
      ...(note !== undefined ? { note } : {}),
      object: updated,
      objects: [updated],
    });

    return { assetId, ok, record };
  }

  // ------------------------------------------------------ Evidence package

  /**
   * Generate an Evidence Package (KMOS-0202 §18) bundling the asset, its
   * immutable versions, provenance, the reconstructed lineage graph, integrity
   * history, and by-identifier references to related events. Publishes
   * EvidencePackageCreated.
   */
  async generateEvidencePackage(assetId: CanonicalId): Promise<EvidencePackageObject> {
    const asset = this.requireAsset(assetId);
    const now = this.now();
    const versions = this.versions.forAsset(assetId);
    const lineageGraph = this.getLineage(assetId);

    // Related events for this subject, captured by-identifier (KMOS-0202 §18).
    const relatedEvents = (await this.bus.eventLog.read(1)).filter(
      (s) => s.event.identity.subjectId === assetId,
    );
    const references: CanonicalReference[] = relatedEvents.map((s) => ({
      relation: 'recordedByEvent',
      targetId: s.event.identity.eventId,
      targetType: s.event.identity.type,
    }));

    const pkg = createCanonicalObject<EvidencePackageObject['body']>({
      id: newCanonicalId('EvidencePackage'),
      type: 'EvidencePackage',
      schemaVersion: SCHEMA_VERSION,
      owner: 'AssetRegistry',
      lifecycle: 'Active',
      displayName: `Evidence for ${asset.displayName ?? assetId}`,
      ...(asset.organizationId !== undefined ? { organizationId: asset.organizationId } : {}),
      now,
      body: {
        assetId,
        assetVersionIds: versions.map((v) => v.id),
        provenanceId: asset.body.provenanceId,
        lineageId: asset.body.lineageId,
        lineage: lineageGraph,
        integrity: asset.body.integrity,
        references,
        generatedAt: now,
      },
    });
    this.evidence.put(pkg);

    await this.publish('EvidencePackageCreated', assetId, asset.organizationId, {
      assetId,
      evidencePackageId: pkg.id,
      versionCount: versions.length,
      object: pkg,
      objects: [pkg],
    });
    return pkg;
  }

  getEvidencePackage(id: CanonicalId): EvidencePackageObject | undefined {
    return this.evidence.get(id);
  }

  // -------------------------------------------------------------- Lifecycle

  /**
   * Transition an asset's lifecycle (KMOS-0202 §19) using the canonical
   * `canTransition` graph. Emits AssetArchived / AssetRestored for the archive
   * and restore transitions, and AssetUpdated otherwise.
   */
  async transitionLifecycle(assetId: CanonicalId, to: LifecycleState): Promise<AssetObject> {
    const asset = this.requireAsset(assetId);
    if (!canTransition(asset.lifecycle, to)) {
      throw new KmosError(`Illegal lifecycle transition ${asset.lifecycle} -> ${to}`, {
        category: 'BusinessRule',
        code: 'asset.lifecycle.illegal_transition',
        subject: assetId,
        detail: { from: asset.lifecycle, to },
      });
    }
    const updated = this.reviseAsset(asset, { lifecycle: to });
    this.assets.put(updated);

    const type =
      to === 'Archived' ? 'AssetArchived' : asset.lifecycle === 'Archived' ? 'AssetRestored' : 'AssetUpdated';
    await this.publish(type, assetId, asset.organizationId, {
      assetId,
      from: asset.lifecycle,
      to,
      object: updated,
      objects: [updated],
    });
    return updated;
  }

  /** Convenience: Archive an asset (KMOS-0202 §8). */
  archiveAsset(assetId: CanonicalId): Promise<AssetObject> {
    return this.transitionLifecycle(assetId, 'Archived');
  }

  // ------------------------------------------------------- Read-model recovery

  /**
   * Read-model recovery: rebuild every repository the service owns by replaying
   * the durable event log. Each object-lifecycle event carries full `objects`
   * snapshots (asset, versions, provenance, lineage, evidence packages) of every
   * repo-backed object it created or mutated. Replaying them in append order —
   * upserting each snapshot by id into the repository keyed by `object.type` —
   * reconstructs each object's head and the full version chain identically to the
   * original write sequence. Because AssetVersion snapshots have distinct ids the
   * whole immutable chain is restored, while Asset/Provenance/Lineage upserts
   * converge on their latest state exactly as the write path (put) would. Called
   * once on boot when backed by a durable log so getAsset, getVersionHistory,
   * getProvenance, getLineage and getEvidencePackage behave identically before and
   * after a restart.
   */
  async hydrate(): Promise<void> {
    for (const stored of await this.bus.eventLog.read(1)) {
      const payload = stored.event.payload as {
        objects?: readonly CanonicalObject[];
        object?: CanonicalObject;
      };
      const snapshots = payload.objects ?? (payload.object ? [payload.object] : []);
      for (const snap of snapshots) this.rehydrate(snap);
    }
  }

  /** Upsert a snapshot into the repository that owns its canonical type. */
  private rehydrate(obj: CanonicalObject): void {
    switch (obj.type) {
      case 'Asset':
        this.assets.put(obj as AssetObject);
        break;
      case 'AssetVersion':
        this.versions.put(obj as AssetVersionObject);
        break;
      case 'Provenance':
        this.provenance.put(obj as ProvenanceObject);
        break;
      case 'Lineage':
        this.lineage.put(obj as LineageObject);
        break;
      case 'EvidencePackage':
        this.evidence.put(obj as EvidencePackageObject);
        break;
    }
  }

  // ----------------------------------------------------------------- Helpers

  private requireAsset(assetId: CanonicalId): AssetObject {
    const asset = this.assets.get(assetId);
    if (!asset) throw this.notFound('Asset', assetId);
    return asset;
  }

  private lineageOf(assetId: CanonicalId): LineageObject | undefined {
    const asset = this.assets.get(assetId);
    if (!asset) return undefined;
    return this.lineage.get(asset.body.lineageId);
  }

  /** Apply a derivation edge to the lineage of derived + input assets. */
  private applyDerivation(input: RecordDerivationInput, now: string): LineageObject {
    const derivation: Derivation = {
      derivedAssetId: input.derivedAssetId,
      inputAssetIds: input.inputAssetIds,
      ...(input.transformationCapabilityId !== undefined
        ? { transformationCapabilityId: input.transformationCapabilityId }
        : {}),
      ...(input.transformationCapabilityVersion !== undefined
        ? { transformationCapabilityVersion: input.transformationCapabilityVersion }
        : {}),
      ...(input.workflowId !== undefined ? { workflowId: input.workflowId } : {}),
      at: now,
    };

    const derivedLineage = this.lineageOf(input.derivedAssetId);
    if (derivedLineage) {
      const mergedParents = unique([...derivedLineage.body.parentAssetIds, ...input.inputAssetIds]);
      this.lineage.put(
        this.reviseLineage(derivedLineage, { parentAssetIds: mergedParents, producedBy: derivation }),
      );
    }

    for (const inputId of input.inputAssetIds) {
      const inputLineage = this.lineageOf(inputId);
      if (!inputLineage) continue;
      const mergedChildren = unique([...inputLineage.body.derivedAssetIds, input.derivedAssetId]);
      this.lineage.put(this.reviseLineage(inputLineage, { derivedAssetIds: mergedChildren }));
    }

    return this.lineageOf(input.derivedAssetId) as LineageObject;
  }

  private reviseAsset(asset: AssetObject, patch: Partial<AssetObject>): AssetObject {
    return {
      ...asset,
      ...patch,
      version: asset.version + 1,
      updatedAt: this.now(),
      body: (patch.body as AssetObject['body']) ?? asset.body,
    };
  }

  private reviseLineage(lineage: LineageObject, body: Partial<LineageObject['body']>): LineageObject {
    return {
      ...lineage,
      version: lineage.version + 1,
      updatedAt: this.now(),
      body: { ...lineage.body, ...body },
    };
  }

  private async publish(
    type: string,
    subjectId: CanonicalId,
    organizationId: CanonicalId | undefined,
    payload: Record<string, unknown>,
  ): Promise<StoredEvent> {
    const event: CanonicalEvent = createEvent({
      type,
      schemaVersion: SCHEMA_VERSION,
      producer: PRODUCER,
      subjectId,
      payload,
      time: this.now(),
      ...(organizationId !== undefined ? { organizationId } : {}),
    });
    return this.bus.publish(event, { streamId: subjectId });
  }

  private notFound(type: string, id: CanonicalId): KmosError {
    return new KmosError(`${type} not found: ${id}`, {
      category: 'NotFound',
      code: `${type.toLowerCase()}.not_found`,
      subject: id,
    });
  }
}
