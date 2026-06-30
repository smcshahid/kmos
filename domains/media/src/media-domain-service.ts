/**
 * Media domain service (KMOS-0002 Media, KMOS-0009 reference applications).
 *
 * A DOMAIN composes capabilities into a business solution; it contains no
 * business logic itself (that lives in capabilities) and coordinates through the
 * Workflow Service, which executes capabilities via the Capability Runtime. The
 * domain registers the abilities it needs in the Capability Registry and runs a
 * declarative workflow, then registers the produced evidence in the Asset
 * Registry with lineage.
 */

import {
  EventBus, createEvent, type CanonicalId,
} from '@kmos/canonical-kernel';
import type { AssetRegistryService } from '@kmos/assets';
import type { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { WorkflowService } from '@kmos/workflow';
import { transcription } from '@kmos/reference-capabilities';
import { RuntimeCapabilityInvoker } from './infrastructure/runtime-invoker.js';
import { sha256, bytes } from './infrastructure/checksum.js';

export interface MediaDomainOptions {
  readonly bus: EventBus;
  readonly assets: AssetRegistryService;
  readonly registry: CapabilityRegistryService;
  readonly runtime: CapabilityRuntimeService;
  readonly now?: () => string;
}

export interface PreserveLectureInput {
  readonly title: string;
  readonly audioRef: string;
  readonly checksum: string;
  readonly organizationId?: CanonicalId;
}

export interface PreserveLectureResult {
  readonly audioAssetId: CanonicalId;
  readonly transcriptAssetId: CanonicalId;
  readonly transcript: string;
  readonly workflowExecutionId: CanonicalId;
  readonly state: string;
}

export class MediaDomainService {
  private readonly bus: EventBus;
  private readonly assets: AssetRegistryService;
  private readonly registry: CapabilityRegistryService;
  private readonly runtime: CapabilityRuntimeService;
  private readonly workflow: WorkflowService;
  private readonly now: () => string;
  private transcribeCapabilityId?: CanonicalId;

  constructor(opts: MediaDomainOptions) {
    this.bus = opts.bus;
    this.assets = opts.assets;
    this.registry = opts.registry;
    this.runtime = opts.runtime;
    this.now = opts.now ?? (() => new Date().toISOString());
    this.workflow = new WorkflowService({ bus: this.bus, invoker: new RuntimeCapabilityInvoker(this.runtime), now: this.now });
  }

  /** Register the capabilities this domain composes (idempotent per instance). */
  async setup(): Promise<void> {
    const d = transcription.descriptor;
    const cap = await this.registry.registerCapability({
      name: d.name, ownerDomain: d.ownerDomain, businessPurpose: d.businessPurpose, version: d.version,
      inputs: [...d.inputs], outputs: [...d.outputs], contract: { ...d.contract, consumedEvents: [...d.contract.consumedEvents], publishedEvents: [...d.contract.publishedEvents], acceptedObjects: [...d.contract.acceptedObjects], producedObjects: [...d.contract.producedObjects] },
    });
    this.transcribeCapabilityId = cap.id;
    await this.runtime.registerImplementation(cap.id, d.version, transcription.create());
  }

  /** Import a lecture's audio, transcribe it via the workflow, and register the transcript with lineage. */
  async preserveLecture(input: PreserveLectureInput): Promise<PreserveLectureResult> {
    if (!this.transcribeCapabilityId) await this.setup();
    const capId = this.transcribeCapabilityId as CanonicalId;

    // 1) Register the source audio asset (evidence).
    const audio = await this.assets.registerAsset({
      assetType: 'Media', mediaType: 'audio/wav', displayName: input.title,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      storageRef: { storageId: input.audioRef, backend: 'object' },
      checksum: sha256(`audio:${input.audioRef}`), content: bytes(`audio:${input.audioRef}`),
      provenance: { origin: 'Ingested', originalSource: input.audioRef },
    });
    await this.emit('LectureImported', audio.id, { assetId: audio.id, title: input.title }, input.organizationId);

    // 2) Coordinate transcription via the workflow (which runs the capability via the runtime).
    const def = await this.workflow.registerWorkflow({
      name: 'media.transcribe', ownerDomain: 'Media', businessPurpose: 'Transcribe a lecture',
      steps: [{ id: 'transcribe', kind: 'activity', capabilityRef: capId, input: { audioRef: '$input.audioRef' } }],
    });
    const exec = await this.workflow.start(def.id, { audioRef: input.audioRef });
    const transcript = String((exec.body.stepResults['transcribe']?.output as { transcript?: string } | undefined)?.transcript ?? '');

    // 3) Register the transcript as a derived asset (lineage from the audio).
    const transcriptAsset = await this.assets.registerAsset({
      assetType: 'Document', mediaType: 'text/plain', displayName: `${input.title} — transcript`,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      storageRef: { storageId: `${input.audioRef}.txt`, backend: 'object' },
      checksum: sha256(transcript), content: bytes(transcript),
      provenance: { origin: 'DerivedByCapability', producingCapabilityId: capId, sourceAssetIds: [audio.id] },
    });
    await this.assets.recordDerivation({ derivedAssetId: transcriptAsset.id, inputAssetIds: [audio.id], transformationCapabilityId: capId });
    await this.emit('LectureProcessed', audio.id, { audioAssetId: audio.id, transcriptAssetId: transcriptAsset.id }, input.organizationId);

    return { audioAssetId: audio.id, transcriptAssetId: transcriptAsset.id, transcript, workflowExecutionId: exec.id, state: exec.body.state };
  }

  private async emit(type: string, subjectId: CanonicalId, payload: Record<string, unknown>, organizationId?: CanonicalId): Promise<void> {
    const ev = createEvent({ type, schemaVersion: '1.0', producer: 'MediaDomain', subjectId, payload, time: this.now(), ...(organizationId !== undefined ? { organizationId } : {}) });
    await this.bus.publish(ev, { streamId: subjectId });
  }
}
