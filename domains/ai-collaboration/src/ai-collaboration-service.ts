/**
 * AI Collaboration domain service (KMOS-0008 — AI Collaboration & Human
 * Governance Framework).
 *
 * KMOS-0008's cardinal rule: AI is a COLLABORATOR, never the system of record;
 * humans govern. This domain composes platform services into that contract:
 *
 *   - Identity Service: every AI worker has a canonical identity of kind
 *     'AiWorker' (AI never operates anonymously — every fact is attributable).
 *   - Capability Registry: the worker's ability is catalogued as a Capability.
 *   - Capability Runtime: the worker's implementation runs behind that stable
 *     contract, isolated and observable.
 *   - Governance Service: human review of an AI output is routed through an
 *     Approval so the human decision is recorded as governance evidence. Only
 *     human-approved contributions become authoritative.
 *
 * Every invocation is recorded as an AiContribution: a non-authoritative
 * RECOMMENDATION with a 'Pending' human review status. The domain itself holds
 * no AI business logic (that is the worker's handler); it coordinates the
 * platform services and keeps the audit trail.
 */

import {
  EventBus,
  KmosError,
  createEvent,
  type CanonicalId,
} from '@kmos/canonical-kernel';
import { IdentityService } from '@kmos/identity';
import { GovernanceService } from '@kmos/governance';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import {
  makeAiContribution,
  type AiContributionObject,
  type ReviewVerdict,
} from './ai-contribution.js';
import { AiWorkerHandler, type AiWorkerFn } from './infrastructure/ai-worker-handler.js';

const PRODUCER = 'AiCollaborationDomain';

export interface AiCollaborationOptions {
  /** Shared event bus (inject the platform-catalog-backed bus in composition). */
  readonly bus: EventBus;
  readonly identity: IdentityService;
  readonly governance: GovernanceService;
  readonly registry: CapabilityRegistryService;
  readonly runtime: CapabilityRuntimeService;
  /** Deterministic clock for events/objects (tests/replay). */
  readonly now?: () => string;
}

export interface RegisterAiWorkerInput {
  /** Display name of the AI worker (used for its canonical identity). */
  readonly name: string;
  /** Domain that owns this worker (the registered capability's ownerDomain). */
  readonly ownerDomain: string;
  /** Model version the worker runs, recorded on every contribution. */
  readonly modelVersion: string;
  /** The worker's business logic; adapted to a runtime CapabilityHandler. */
  readonly handler: AiWorkerFn;
  /** Semantic version of the capability (defaults to 1.0.0). */
  readonly version?: string;
  /** Short statement of what the worker is for. */
  readonly businessPurpose?: string;
  /** Optional organization scope for the worker identity. */
  readonly organizationId?: CanonicalId;
}

export interface RegisterAiWorkerResult {
  /** Canonical Identity id of the AI worker (kind 'AiWorker'; never anonymous). */
  readonly aiWorkerIdentityId: CanonicalId;
  /** Capability id registered for the worker. */
  readonly capabilityId: CanonicalId;
  /** Capability version registered + activated in the runtime. */
  readonly version: string;
}

export interface InvokeAiWorkerInput {
  readonly capabilityId: CanonicalId;
  readonly input: Record<string, unknown>;
  readonly organizationId?: CanonicalId;
}

export interface SubmitHumanReviewInput {
  readonly contributionId: CanonicalId;
  /** The human reviewer (identifier/name) rendering the decision. */
  readonly reviewer: string;
  /** The human verdict: 'Approved' makes the contribution authoritative. */
  readonly verdict: ReviewVerdict;
  /** Optional rationale recorded with the governance decision. */
  readonly reason?: string;
}

interface WorkerRecord {
  readonly identityId: CanonicalId;
  readonly modelVersion: string;
  readonly version: string;
}

export class AiCollaborationService {
  private readonly bus: EventBus;
  private readonly identity: IdentityService;
  private readonly governance: GovernanceService;
  private readonly registry: CapabilityRegistryService;
  private readonly runtime: CapabilityRuntimeService;
  private readonly now: () => string;

  /** capabilityId -> worker metadata, so invocations can attribute the worker. */
  private readonly workers = new Map<CanonicalId, WorkerRecord>();
  /** contributionId -> contribution (this domain keeps the contribution ledger). */
  private readonly contributions = new Map<CanonicalId, AiContributionObject>();

  constructor(opts: AiCollaborationOptions) {
    this.bus = opts.bus;
    this.identity = opts.identity;
    this.governance = opts.governance;
    this.registry = opts.registry;
    this.runtime = opts.runtime;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  /**
   * Register an AI worker as a first-class collaborator:
   *   1) create a canonical Identity of kind 'AiWorker' (AI is never anonymous),
   *   2) register a Capability for the worker in the Capability Registry, and
   *   3) register + activate the provided handler in the Capability Runtime.
   */
  async registerAiWorker(input: RegisterAiWorkerInput): Promise<RegisterAiWorkerResult> {
    const version = input.version ?? '1.0.0';

    // 1) Canonical AI worker identity — first-class, never anonymous.
    const identity = await this.identity.createIdentity({
      kind: 'AiWorker',
      displayName: input.name,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    });

    // 2) Catalog the worker's ability as a Capability.
    const capability = await this.registry.registerCapability({
      name: input.name,
      ownerDomain: input.ownerDomain,
      businessPurpose:
        input.businessPurpose ?? `AI worker '${input.name}' contributing recommendations for human review`,
      version,
      inputs: ['prompt'],
      outputs: ['recommendation'],
      contract: {
        acceptedObjects: [],
        producedObjects: ['AiContribution'],
        consumedEvents: [],
        publishedEvents: ['AiContributionRecorded'],
      },
    });

    // 3) Run the worker's implementation behind that stable contract.
    await this.runtime.registerImplementation(capability.id, version, new AiWorkerHandler(input.handler));

    this.workers.set(capability.id, {
      identityId: identity.id,
      modelVersion: input.modelVersion,
      version,
    });

    return { aiWorkerIdentityId: identity.id, capabilityId: capability.id, version };
  }

  /**
   * Invoke an AI worker via the Capability Runtime and record an AiContribution.
   * The AI output is a RECOMMENDATION, not authoritative: the contribution is
   * created with humanReviewStatus 'Pending' and authoritative=false, and
   * AiContributionRecorded is emitted on the shared bus.
   */
  async invokeAiWorker(input: InvokeAiWorkerInput): Promise<AiContributionObject> {
    const worker = this.workers.get(input.capabilityId);
    if (worker === undefined) {
      throw new KmosError('Unknown AI worker capability', {
        category: 'NotFound',
        code: 'ai.worker.not_found',
        subject: input.capabilityId,
      });
    }

    // Run the worker behind its contract, on the authority of its AI identity.
    const result = await this.runtime.invoke<Record<string, unknown>, { output: unknown; confidence: number }>(
      input.capabilityId,
      input.input,
      {
        actorId: worker.identityId,
        ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      },
    );
    if (!result.success) {
      throw result.error ??
        new KmosError('AI worker invocation failed', {
          category: 'Transient',
          code: 'ai.worker.invocation_failed',
          subject: input.capabilityId,
        });
    }

    const out = result.output ?? { output: undefined, confidence: 0 };
    const confidence = typeof out.confidence === 'number' ? out.confidence : 0;

    const contribution = makeAiContribution({
      capabilityId: input.capabilityId,
      aiWorkerIdentityId: worker.identityId,
      modelVersion: worker.modelVersion,
      executionId: result.executionId,
      inputSummary: this.summarize(input.input),
      outputSummary: this.summarize(out.output),
      confidence,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      now: this.now(),
    });
    this.contributions.set(contribution.id, contribution);

    await this.emit(
      'AiContributionRecorded',
      contribution.id,
      {
        contributionId: contribution.id,
        capabilityId: input.capabilityId,
        aiWorkerIdentityId: worker.identityId,
        modelVersion: worker.modelVersion,
        executionId: result.executionId,
        confidence,
        humanReviewStatus: contribution.body.humanReviewStatus,
        authoritative: contribution.body.authoritative,
      },
      input.organizationId,
      worker.identityId,
    );

    return contribution;
  }

  /**
   * Route a human review of an AI contribution through the Governance Service:
   * request an Approval (the human decision is governance evidence), then grant
   * or reject it. The contribution's humanReviewStatus is updated to
   * 'Approved'/'Rejected'; only an approved contribution is marked authoritative
   * (human approval remains authoritative for institutional knowledge).
   */
  async submitHumanReview(input: SubmitHumanReviewInput): Promise<AiContributionObject> {
    const existing = this.contributions.get(input.contributionId);
    if (existing === undefined) {
      throw new KmosError('Unknown AI contribution', {
        category: 'NotFound',
        code: 'ai.contribution.not_found',
        subject: input.contributionId,
      });
    }
    if (existing.body.humanReviewStatus !== 'Pending') {
      throw new KmosError(`AI contribution already reviewed: ${existing.body.humanReviewStatus}`, {
        category: 'BusinessRule',
        code: 'ai.contribution.already_reviewed',
        subject: input.contributionId,
        detail: { status: existing.body.humanReviewStatus },
      });
    }

    const reason = input.reason ?? `Human review of AI contribution ${input.contributionId}`;

    // Route the human decision through Governance: request, then decide. The
    // Approval is keyed to the contribution as its subject, so the audit trail
    // links the governance decision to the AI output.
    const approval = this.governance.requestApproval({
      subjectId: input.contributionId,
      reviewers: [input.reviewer],
      mode: 'Single',
    });

    if (input.verdict === 'Approved') {
      this.governance.grantApproval(approval.id, input.reviewer, reason);
    } else {
      this.governance.rejectApproval(approval.id, input.reviewer, reason);
    }

    const approved = input.verdict === 'Approved';
    const status = approved ? 'Approved' : 'Rejected';
    const updated: AiContributionObject = {
      ...existing,
      version: existing.version + 1,
      updatedAt: this.now(),
      lifecycle: approved ? 'Approved' : existing.lifecycle,
      governance: { ...existing.governance, approvalState: approved ? 'Granted' : 'Rejected' },
      body: {
        ...existing.body,
        humanReviewStatus: status,
        authoritative: approved,
        approvalId: approval.id,
        reviewer: input.reviewer,
      },
    };
    this.contributions.set(updated.id, updated);

    // The human decision itself is recorded by the Governance Service, which
    // publishes ApprovalGranted/ApprovalRejected on the shared bus. We do not
    // mint a new event type here; governance is the system of record for the
    // human decision (KMOS-0008: humans govern).

    return updated;
  }

  /** Get a single recorded AI contribution. */
  getContribution(id: CanonicalId): AiContributionObject | undefined {
    return this.contributions.get(id);
  }

  /** List all recorded AI contributions (newest insertion order preserved). */
  listContributions(): readonly AiContributionObject[] {
    return [...this.contributions.values()];
  }

  // --- helpers -------------------------------------------------------------

  private summarize(value: unknown): string {
    if (value === undefined || value === null) return '';
    const s = typeof value === 'string' ? value : JSON.stringify(value);
    return s.length > 280 ? `${s.slice(0, 277)}...` : s;
  }

  private async emit(
    type: string,
    subjectId: CanonicalId,
    payload: Record<string, unknown>,
    organizationId?: CanonicalId,
    actorId?: CanonicalId,
  ): Promise<void> {
    const event = createEvent({
      type,
      schemaVersion: '1.0',
      producer: PRODUCER,
      subjectId,
      payload,
      time: this.now(),
      ...(organizationId !== undefined ? { organizationId } : {}),
      ...(actorId !== undefined ? { actorId } : {}),
    });
    await this.bus.publish(event, { streamId: subjectId });
  }
}
