/**
 * AiContribution canonical object (KMOS-0008 §9).
 *
 * An AiContribution is the durable, explainable record of a single AI worker
 * execution. It is owned by the GovernanceService (the AI output is governed,
 * not authoritative) and captures everything KMOS-0008 §9 requires to make an
 * AI contribution explainable and reproducible: the capability that ran, the AI
 * worker's canonical identity, the model version, a summary of the input/output,
 * a confidence score, and a human review status.
 *
 * The cardinal rule of KMOS-0008: AI is a COLLABORATOR, never the system of
 * record. An AI output is a RECOMMENDATION. A contribution only becomes
 * `authoritative` once a human review has been recorded through the Governance
 * Service and the verdict was 'Approved'. Until then it remains 'Pending' and is
 * never authoritative.
 */

import {
  createCanonicalObject,
  newCanonicalId,
  type CanonicalId,
  type CanonicalObject,
} from '@kmos/canonical-kernel';

/** Human review lifecycle for an AI contribution (KMOS-0008 §9, §13). */
export type HumanReviewStatus = 'Pending' | 'Approved' | 'Rejected';

/** The verdict a human reviewer renders on an AI contribution. */
export type ReviewVerdict = 'Approved' | 'Rejected';

export interface AiContributionBody {
  /** Capability (the AI worker's registered ability) that produced this output. */
  readonly capabilityId: CanonicalId;
  /** Canonical identity of the AI worker (AI never operates anonymously). */
  readonly aiWorkerIdentityId: CanonicalId;
  /** Model version the worker ran, for reproducibility (KMOS-0008 §9). */
  readonly modelVersion: string;
  /** The runtime execution id of the invocation. */
  readonly executionId: CanonicalId;
  /** Compact, human-readable summary of the input. */
  readonly inputSummary: string;
  /** Compact, human-readable summary of the AI output. */
  readonly outputSummary: string;
  /** AI-reported confidence in [0,1]; confidence never replaces verification. */
  readonly confidence: number;
  /** Where the contribution sits in the human review lifecycle. */
  readonly humanReviewStatus: HumanReviewStatus;
  /**
   * True ONLY once a human review has approved the contribution. AI output is a
   * recommendation; it is authoritative only after human approval (KMOS-0008 §7,
   * §12: human approval remains authoritative for institutional knowledge).
   */
  readonly authoritative: boolean;
  /** The Governance Approval routing the human decision, once review is requested. */
  readonly approvalId?: CanonicalId;
  /** Who reviewed it (set once a decision is recorded). */
  readonly reviewer?: string;
}

export type AiContributionObject = CanonicalObject<AiContributionBody>;

export interface NewAiContributionInput {
  readonly capabilityId: CanonicalId;
  readonly aiWorkerIdentityId: CanonicalId;
  readonly modelVersion: string;
  readonly executionId: CanonicalId;
  readonly inputSummary: string;
  readonly outputSummary: string;
  readonly confidence: number;
  readonly organizationId?: CanonicalId;
  readonly now?: string;
}

/**
 * Construct a fresh AiContribution. It always starts non-authoritative with a
 * 'Pending' human review status: the AI output is a recommendation that requires
 * human verification before it can be treated as authoritative.
 */
export function makeAiContribution(input: NewAiContributionInput): AiContributionObject {
  return createCanonicalObject<AiContributionBody>({
    id: newCanonicalId('AiContribution'),
    type: 'AiContribution',
    schemaVersion: '1.0',
    owner: 'GovernanceService',
    lifecycle: 'Active',
    displayName: `AiContribution for ${input.capabilityId}`,
    ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    relationships: [
      { relation: 'producedBy', targetId: input.aiWorkerIdentityId, targetType: 'Identity' },
      { relation: 'viaCapability', targetId: input.capabilityId, targetType: 'Capability' },
    ],
    governance: { approvalState: 'Pending' },
    body: {
      capabilityId: input.capabilityId,
      aiWorkerIdentityId: input.aiWorkerIdentityId,
      modelVersion: input.modelVersion,
      executionId: input.executionId,
      inputSummary: input.inputSummary,
      outputSummary: input.outputSummary,
      confidence: input.confidence,
      humanReviewStatus: 'Pending',
      authoritative: false,
    },
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
}
