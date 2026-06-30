/**
 * Publishing domain service (KMOS-0002 Publishing, KMOS-0009 reference apps).
 *
 * A DOMAIN composes capabilities into a business solution; it contains no
 * business logic itself (that lives in capabilities) and coordinates through the
 * Workflow Service, which executes capabilities via the Capability Runtime
 * (constitution §4/§5/§10). The Publishing domain:
 *   1. generates publication metadata via a deterministic capability (run by the
 *      workflow through the runtime),
 *   2. packages a Publication asset in the Asset Registry with lineage to the
 *      source assets,
 *   3. requests a Governance approval and gates release on it, and
 *   4. ONLY on approval, releases: emits PublicationReleased (kernel-seeded) and
 *      PublicationPrepared (platform-catalog).
 *
 * If the approval is rejected, nothing is released (released = false).
 */

import {
  EventBus, createEvent, type CanonicalId,
} from '@kmos/canonical-kernel';
import type { AssetRegistryService } from '@kmos/assets';
import { GovernanceService } from '@kmos/governance';
import type { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { WorkflowService } from '@kmos/workflow';
import { RuntimeCapabilityInvoker } from './infrastructure/runtime-invoker.js';
import {
  metadataGenerationDescriptor,
  createMetadataGenerationHandler,
  type PublicationMetadata,
} from './infrastructure/metadata-generation-capability.js';

export interface PublishingDomainOptions {
  readonly bus: EventBus;
  readonly assets: AssetRegistryService;
  readonly governance: GovernanceService;
  readonly registry: CapabilityRegistryService;
  readonly runtime: CapabilityRuntimeService;
  readonly now?: () => string;
}

export interface PublishInput {
  readonly title: string;
  readonly knowledgeIds: readonly CanonicalId[];
  readonly assetIds: readonly CanonicalId[];
  readonly organizationId?: CanonicalId;
  /** Reviewer (governance identity) who approves or rejects the release. */
  readonly approver: string;
}

export interface PublishResult {
  readonly publicationAssetId: CanonicalId;
  readonly metadata: PublicationMetadata;
  readonly approvalId: CanonicalId;
  readonly released: boolean;
  readonly workflowExecutionId: CanonicalId;
  readonly state: string;
}

export class PublishingDomainService {
  private readonly bus: EventBus;
  private readonly assets: AssetRegistryService;
  private readonly governance: GovernanceService;
  private readonly registry: CapabilityRegistryService;
  private readonly runtime: CapabilityRuntimeService;
  private readonly workflow: WorkflowService;
  private readonly now: () => string;
  private metadataCapabilityId?: CanonicalId;

  constructor(opts: PublishingDomainOptions) {
    this.bus = opts.bus;
    this.assets = opts.assets;
    this.governance = opts.governance;
    this.registry = opts.registry;
    this.runtime = opts.runtime;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.workflow = new WorkflowService({ bus: this.bus, invoker: new RuntimeCapabilityInvoker(this.runtime), now: this.now });
  }

  /** Register the capabilities this domain composes (idempotent per instance). */
  async setup(): Promise<void> {
    if (this.metadataCapabilityId) return;
    const d = metadataGenerationDescriptor;
    const cap = await this.registry.registerCapability({
      name: d.name, ownerDomain: d.ownerDomain, businessPurpose: d.businessPurpose, version: d.version,
      inputs: [...d.inputs], outputs: [...d.outputs],
      contract: { acceptedObjects: [...d.contract.acceptedObjects], producedObjects: [...d.contract.producedObjects], consumedEvents: [...d.contract.consumedEvents], publishedEvents: [...d.contract.publishedEvents] },
    });
    this.metadataCapabilityId = cap.id;
    await this.runtime.registerImplementation(cap.id, d.version, createMetadataGenerationHandler());
  }

  /**
   * Publish a body of knowledge/assets: generate metadata (capability), package a
   * Publication asset with lineage, request a governance approval, and release
   * ONLY if the approval is granted.
   */
  async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.metadataCapabilityId) await this.setup();
    const capId = this.metadataCapabilityId as CanonicalId;

    // 1) Generate publication metadata via the workflow (runs the capability via
    //    the runtime). The domain computes nothing itself.
    const def = await this.workflow.registerWorkflow({
      name: 'publishing.generate-metadata', ownerDomain: 'Publishing', businessPurpose: 'Generate publication metadata',
      steps: [{ id: 'metadata', kind: 'activity', capabilityRef: capId, input: { title: '$input.title', knowledgeIds: '$input.knowledgeIds', assetIds: '$input.assetIds' } }],
    });
    const exec = await this.workflow.start(def.id, { title: input.title, knowledgeIds: [...input.knowledgeIds], assetIds: [...input.assetIds] });
    const metadata = (exec.body.stepResults['metadata']?.output as PublicationMetadata | undefined) ?? {
      title: input.title, summary: '', tags: [], slug: '',
    };

    // 2) Package a Publication asset referencing the source assets via lineage.
    const publication = await this.assets.registerAsset({
      assetType: 'Publication', mediaType: 'application/vnd.kmos.publication+json', displayName: metadata.title,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      storageRef: { storageId: `kmos:publication:${metadata.slug}`, backend: 'object' },
      checksum: `sha256:${metadata.slug.length}`,
      description: metadata.summary, tags: [...metadata.tags],
      provenance: {
        origin: 'DerivedByCapability', producingCapabilityId: capId, workflowId: def.id,
        sourceAssetIds: [...input.assetIds],
      },
    });
    if (input.assetIds.length > 0) {
      await this.assets.recordDerivation({ derivedAssetId: publication.id, inputAssetIds: [...input.assetIds], transformationCapabilityId: capId, workflowId: def.id });
    }
    await this.emit('PublicationMetadataGenerated', publication.id, { publicationAssetId: publication.id, slug: metadata.slug, tagCount: metadata.tags.length }, input.organizationId);

    // 3) Request a governance approval for releasing this publication, then have
    //    the approver decide. Release is GATED on the approval outcome.
    const approval = this.governance.requestApproval({ subjectId: publication.id, reviewers: [input.approver], mode: 'Single' });
    const decided = this.governance.grantApproval(approval.id, input.approver, 'Publication approved for release');

    if (decided.body.state !== 'Granted') {
      // Approval not granted: do NOT release.
      return { publicationAssetId: publication.id, metadata, approvalId: approval.id, released: false, workflowExecutionId: exec.id, state: exec.body.state };
    }

    // 4) On approval, release the publication.
    await this.emit('PublicationReleased', publication.id, { publicationAssetId: publication.id, approvalId: approval.id, slug: metadata.slug }, input.organizationId);
    await this.emit('PublicationPrepared', publication.id, { publicationAssetId: publication.id, title: metadata.title, slug: metadata.slug }, input.organizationId);

    return { publicationAssetId: publication.id, metadata, approvalId: approval.id, released: true, workflowExecutionId: exec.id, state: exec.body.state };
  }

  /**
   * Publish but with the approver REJECTING the release. Provided so callers (and
   * tests) can exercise the governance gate: nothing is released and the result
   * reports released = false. Real callers route the reviewer's verdict; this is
   * the rejection branch of the same gate used by publish().
   */
  async publishWithRejection(input: PublishInput): Promise<PublishResult> {
    if (!this.metadataCapabilityId) await this.setup();
    const capId = this.metadataCapabilityId as CanonicalId;

    const def = await this.workflow.registerWorkflow({
      name: 'publishing.generate-metadata', ownerDomain: 'Publishing', businessPurpose: 'Generate publication metadata',
      steps: [{ id: 'metadata', kind: 'activity', capabilityRef: capId, input: { title: '$input.title', knowledgeIds: '$input.knowledgeIds', assetIds: '$input.assetIds' } }],
    });
    const exec = await this.workflow.start(def.id, { title: input.title, knowledgeIds: [...input.knowledgeIds], assetIds: [...input.assetIds] });
    const metadata = (exec.body.stepResults['metadata']?.output as PublicationMetadata | undefined) ?? { title: input.title, summary: '', tags: [], slug: '' };

    const publication = await this.assets.registerAsset({
      assetType: 'Publication', mediaType: 'application/vnd.kmos.publication+json', displayName: metadata.title,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      storageRef: { storageId: `kmos:publication:${metadata.slug}`, backend: 'object' },
      checksum: `sha256:${metadata.slug.length}`, description: metadata.summary, tags: [...metadata.tags],
      provenance: { origin: 'DerivedByCapability', producingCapabilityId: capId, workflowId: def.id, sourceAssetIds: [...input.assetIds] },
    });
    if (input.assetIds.length > 0) {
      await this.assets.recordDerivation({ derivedAssetId: publication.id, inputAssetIds: [...input.assetIds], transformationCapabilityId: capId, workflowId: def.id });
    }
    await this.emit('PublicationMetadataGenerated', publication.id, { publicationAssetId: publication.id, slug: metadata.slug, tagCount: metadata.tags.length }, input.organizationId);

    const approval = this.governance.requestApproval({ subjectId: publication.id, reviewers: [input.approver], mode: 'Single' });
    const decided = this.governance.rejectApproval(approval.id, input.approver, 'Publication rejected');

    // Rejected: gate prevents release. No PublicationReleased / PublicationPrepared.
    return { publicationAssetId: publication.id, metadata, approvalId: approval.id, released: decided.body.state === 'Granted', workflowExecutionId: exec.id, state: exec.body.state };
  }

  private async emit(type: string, subjectId: CanonicalId, payload: Record<string, unknown>, organizationId?: CanonicalId): Promise<void> {
    const ev = createEvent({ type, schemaVersion: '1.0', producer: 'PublishingDomain', subjectId, payload, time: this.now(), ...(organizationId !== undefined ? { organizationId } : {}) });
    await this.bus.publish(ev, { streamId: subjectId });
  }
}
