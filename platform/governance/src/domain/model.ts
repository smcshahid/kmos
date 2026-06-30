/**
 * Governance domain model (KMOS-0207).
 *
 * Defines the canonical-object BODIES the Governance Service owns and the rules
 * over them. Governance is EVIDENCE-DRIVEN and EXPLAINABLE: every decision
 * preserves its reason, evidence, reviewer, authority, policy version and time.
 * This module is pure domain logic — zero infrastructure imports (constitution
 * §1/§2). Canonical structure (id, version, lifecycle, owner, governance
 * metadata) comes from the kernel's CanonicalObject; these bodies are the
 * governance-specific payloads.
 */

import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';

// --- Policy --------------------------------------------------------------

/**
 * A policy-version predicate over an arbitrary input object. Kept simple and
 * deterministic (constitution §6): a rule names a field, an operator and an
 * expected value. Evaluation never touches clocks, randomness or IO.
 */
export type PredicateOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'truthy';

export interface PolicyRule {
  readonly field: string;
  readonly operator: PredicateOperator;
  readonly value?: unknown;
  /** Human-readable explanation used in evaluation reasons. */
  readonly description?: string;
}

export interface PolicyVersionBody {
  readonly policyId: CanonicalId;
  readonly version: number;
  /** All rules must hold (logical AND) for the policy to be satisfied. */
  readonly rules: readonly PolicyRule[];
  readonly authoredBy: string;
  readonly authoredAt: string;
}

export type PolicyVersion = CanonicalObject<PolicyVersionBody>;

export interface PolicyBody {
  readonly name: string;
  readonly description: string;
  /** Pointer to the current immutable PolicyVersion. */
  readonly currentVersion: number;
  readonly versionIds: readonly CanonicalId[];
}

export type Policy = CanonicalObject<PolicyBody>;

export interface PolicyEvaluation {
  readonly satisfied: boolean;
  readonly policyId: CanonicalId;
  readonly version: number;
  readonly reasons: readonly string[];
  readonly evaluatedAt: string;
}

/** Deterministically evaluate a policy version's rules against an input object. */
export function evaluateRules(
  rules: readonly PolicyRule[],
  input: Readonly<Record<string, unknown>>,
): { satisfied: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let satisfied = true;
  for (const rule of rules) {
    const actual = input[rule.field];
    const ok = applyOperator(rule.operator, actual, rule.value);
    const label = rule.description ?? `${rule.field} ${rule.operator} ${String(rule.value ?? '')}`;
    reasons.push(`${ok ? 'PASS' : 'FAIL'}: ${label} (actual=${formatValue(actual)})`);
    if (!ok) satisfied = false;
  }
  return { satisfied, reasons };
}

function applyOperator(op: PredicateOperator, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'truthy':
      return Boolean(actual);
    default:
      return false;
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// --- Approval ------------------------------------------------------------

export type ApprovalMode = 'Single' | 'MultipleAll' | 'Sequential';
export type ApprovalState = 'Pending' | 'Granted' | 'Rejected';
export type ReviewerVerdict = 'Granted' | 'Rejected';

export interface ReviewerDecision {
  readonly reviewer: string;
  readonly verdict: ReviewerVerdict;
  readonly reason: string;
  readonly decidedAt: string;
}

export interface ApprovalBody {
  readonly subjectId: CanonicalId;
  readonly mode: ApprovalMode;
  readonly reviewers: readonly string[];
  readonly state: ApprovalState;
  readonly decisions: readonly ReviewerDecision[];
  readonly escalated: boolean;
  readonly policyVersion?: number;
}

export type Approval = CanonicalObject<ApprovalBody>;

/**
 * Resolve an approval's overall state from its mode and the reviewer decisions
 * recorded so far. Pure and deterministic so it is fully replayable.
 *   - Single:      first verdict decides.
 *   - MultipleAll: any rejection rejects; otherwise granted only when EVERY
 *                  named reviewer has granted.
 *   - Sequential:  reviewers must approve in declared order; a rejection at any
 *                  step rejects; granted when the last reviewer in order grants.
 */
export function resolveApprovalState(
  mode: ApprovalMode,
  reviewers: readonly string[],
  decisions: readonly ReviewerDecision[],
): ApprovalState {
  if (decisions.some((d) => d.verdict === 'Rejected')) return 'Rejected';
  const granted = new Set(decisions.filter((d) => d.verdict === 'Granted').map((d) => d.reviewer));
  switch (mode) {
    case 'Single':
      return granted.size >= 1 ? 'Granted' : 'Pending';
    case 'MultipleAll':
      return reviewers.every((r) => granted.has(r)) ? 'Granted' : 'Pending';
    case 'Sequential': {
      // Granted in order means the first N reviewers granted with no gap.
      let count = 0;
      for (const r of reviewers) {
        if (granted.has(r)) count += 1;
        else break;
      }
      return count === reviewers.length ? 'Granted' : 'Pending';
    }
    default:
      return 'Pending';
  }
}

// --- Decision & Audit ----------------------------------------------------

export interface DecisionBody {
  readonly subjectId: CanonicalId;
  /** What kind of governance decision this records (Approval, Certification...). */
  readonly decisionType: string;
  readonly outcome: string;
  readonly authority: string;
  readonly reason: string;
  readonly evidenceRefs: readonly CanonicalId[];
  readonly policyVersion?: number;
  readonly decidedAt: string;
}

export type Decision = CanonicalObject<DecisionBody>;

export interface GovernanceAuditBody {
  readonly subjectId: CanonicalId;
  readonly action: string;
  readonly actor: string;
  readonly outcome: string;
  readonly reason: string;
  readonly evidenceRefs: readonly CanonicalId[];
  readonly recordedAt: string;
}

export type GovernanceAudit = CanonicalObject<GovernanceAuditBody>;

// --- Review --------------------------------------------------------------

export type ReviewState = 'Open' | 'Completed';
export type ReviewConclusion = 'Pass' | 'Fail' | 'NeedsWork';

export interface ReviewBody {
  readonly subjectId: CanonicalId;
  readonly reviewer: string;
  readonly state: ReviewState;
  readonly conclusion?: ReviewConclusion;
  /** Evidence supporting the conclusion — preserved for explainability. */
  readonly evidence: readonly string[];
  readonly completedAt?: string;
}

export type Review = CanonicalObject<ReviewBody>;

// --- Certification -------------------------------------------------------

export type CertificationLevel = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
export type CertificationState = 'Granted' | 'Revoked';

export interface CertificationBody {
  readonly subjectId: CanonicalId;
  readonly level: CertificationLevel;
  readonly state: CertificationState;
  readonly authority: string;
  readonly grantedAt: string;
  readonly revokedAt?: string;
  readonly revocationReason?: string;
}

export type Certification = CanonicalObject<CertificationBody>;

// --- Compliance ----------------------------------------------------------

export type ComplianceResult = 'Compliant' | 'NonCompliant' | 'Partial';

export interface ComplianceRecordBody {
  readonly subjectId: CanonicalId;
  readonly framework: string;
  readonly result: ComplianceResult;
  readonly evidence: readonly string[];
  readonly verifiedBy: string;
  readonly verifiedAt: string;
}

export type ComplianceRecord = CanonicalObject<ComplianceRecordBody>;

// --- Risk ----------------------------------------------------------------

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

const RISK_SCORE: Readonly<Record<RiskLevel, number>> = {
  Low: 1,
  Medium: 2,
  High: 3,
  Critical: 4,
};

export interface RiskAssessmentBody {
  readonly subjectId: CanonicalId;
  readonly level: RiskLevel;
  readonly impact: number; // 1..5
  readonly likelihood: number; // 1..5
  readonly mitigation: string;
  /** Inherent risk = impact * likelihood. */
  readonly inherentRisk: number;
  /** Residual risk after mitigation factor is applied. */
  readonly residualRisk: number;
  readonly assessedBy: string;
  readonly assessedAt: string;
}

export type RiskAssessment = CanonicalObject<RiskAssessmentBody>;

/**
 * Deterministically derive inherent and residual risk. Residual risk reduces
 * inherent risk by a mitigation factor inversely proportional to the declared
 * risk level (higher level => harder to mitigate fully).
 */
export function computeRisk(
  level: RiskLevel,
  impact: number,
  likelihood: number,
): { inherentRisk: number; residualRisk: number } {
  const inherentRisk = impact * likelihood;
  // Mitigation effectiveness: 0.6 for Low down to 0.15 for Critical.
  const effectiveness = 0.6 / RISK_SCORE[level];
  const residualRisk = Math.round(inherentRisk * (1 - effectiveness) * 100) / 100;
  return { inherentRisk, residualRisk };
}

// --- Exception -----------------------------------------------------------

export type ExceptionState = 'Open' | 'Closed';

export interface ExceptionBody {
  readonly reason: string;
  readonly approver: string;
  readonly scope: string;
  readonly state: ExceptionState;
  readonly openedAt: string;
  readonly expiresAt?: string;
  readonly closedAt?: string;
  readonly closeReason?: string;
}

export type Exception = CanonicalObject<ExceptionBody>;

// --- Trust assessment (KMOS-0207) ---------------------------------------

/**
 * Trust evidence supplied to assessTrust. Values are passed IN by the caller —
 * the Governance Service NEVER calls other services to gather them (constitution
 * §4: cross-service contact is events/APIs, not internal calls). Each dimension
 * is optional; absent dimensions count against trust and are explained.
 */
export interface TrustEvidence {
  readonly knowledgeProvenance?: boolean;
  readonly assetIntegrity?: boolean;
  readonly workflowCompletion?: boolean;
  readonly capabilityCertification?: boolean;
  readonly reviewerApproval?: boolean;
  readonly policyCompliance?: boolean;
  readonly identityVerification?: boolean;
}

export interface TrustResult {
  readonly trusted: boolean;
  readonly score: number; // 0..1
  readonly reasons: readonly string[];
}

interface TrustDimension {
  readonly key: keyof TrustEvidence;
  readonly label: string;
}

const TRUST_DIMENSIONS: readonly TrustDimension[] = [
  { key: 'knowledgeProvenance', label: 'knowledge provenance established' },
  { key: 'assetIntegrity', label: 'asset integrity verified' },
  { key: 'workflowCompletion', label: 'workflow completed successfully' },
  { key: 'capabilityCertification', label: 'capability certified' },
  { key: 'reviewerApproval', label: 'reviewer approval present' },
  { key: 'policyCompliance', label: 'policy compliance confirmed' },
  { key: 'identityVerification', label: 'identity verified' },
];

/**
 * Derive an explainable trust result purely from supplied evidence. Trust must
 * NEVER rely on undocumented judgment (KMOS-0207): the score is the fraction of
 * trust dimensions positively evidenced, and the `reasons` array explains every
 * dimension. The subject is trusted when the score meets the threshold AND no
 * mandatory dimension (identity verification, policy compliance) is missing.
 */
export function deriveTrust(evidence: TrustEvidence, threshold = 0.6): TrustResult {
  const reasons: string[] = [];
  let positives = 0;
  const mandatory: ReadonlyArray<keyof TrustEvidence> = ['identityVerification', 'policyCompliance'];
  let mandatoryMissing = false;

  for (const dim of TRUST_DIMENSIONS) {
    const value = evidence[dim.key];
    if (value === true) {
      positives += 1;
      reasons.push(`+ ${dim.label}`);
    } else if (value === false) {
      reasons.push(`- ${dim.label} (evidence negative)`);
      if (mandatory.includes(dim.key)) mandatoryMissing = true;
    } else {
      reasons.push(`- ${dim.label} (no evidence supplied)`);
      if (mandatory.includes(dim.key)) mandatoryMissing = true;
    }
  }

  const score = Math.round((positives / TRUST_DIMENSIONS.length) * 100) / 100;
  const trusted = score >= threshold && !mandatoryMissing;
  reasons.push(
    `=> score ${score} (threshold ${threshold}); ${
      mandatoryMissing ? 'mandatory evidence missing; ' : ''
    }${trusted ? 'TRUSTED' : 'NOT TRUSTED'}`,
  );
  return { trusted, score, reasons };
}
