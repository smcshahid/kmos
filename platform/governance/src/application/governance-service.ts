/**
 * Governance Service application layer (KMOS-0207).
 *
 * The platform's evidence-driven, explainable governance engine. It owns the
 * Policy, Approval, Certification, ComplianceRecord and TrustAssessment canonical
 * objects (plus PolicyVersion, Review, Decision, RiskAssessment, Exception and an
 * immutable GovernanceAudit), and exposes the governance business APIs.
 *
 * Governance principle (KMOS-0207): every decision preserves its reason,
 * evidence, reviewer, authority, policy version and time, and TRUST is derived
 * only from supplied evidence — never undocumented judgment. The service NEVER
 * calls other platform services to gather evidence (constitution §4); evidence
 * is passed in by callers and trust/risk/policy outcomes are explained.
 *
 * Every meaningful change publishes a canonical event (constitution §5). The
 * seeded governance event families come from the kernel catalog; the extra
 * governance facts (PolicyRegistered, ReviewCompleted, ExceptionCreated,
 * CertificationRevoked, ...) are registered on a LOCAL catalog handed to a
 * dedicated EventBus, so the kernel is never mutated.
 */

import {
  EventBus,
  KmosError,
  createCanonicalObject,
  createEvent,
  newCanonicalId,
  type CanonicalId,
} from '@kmos/canonical-kernel';
import { createGovernanceCatalog } from '../domain/catalog.js';
import {
  computeRisk,
  deriveTrust,
  evaluateRules,
  resolveApprovalState,
  type Approval,
  type ApprovalMode,
  type Certification,
  type CertificationLevel,
  type ComplianceRecord,
  type ComplianceResult,
  type Decision,
  type Exception,
  type GovernanceAudit,
  type Policy,
  type PolicyEvaluation,
  type PolicyRule,
  type PolicyVersion,
  type Review,
  type ReviewConclusion,
  type ReviewerVerdict,
  type RiskAssessment,
  type RiskLevel,
  type TrustEvidence,
  type TrustResult,
} from '../domain/model.js';
import type { GovernanceRepositories } from '../domain/ports.js';
import { createInMemoryRepositories } from '../infrastructure/in-memory-repositories.js';

const OWNER = 'GovernanceService' as const;
const PRODUCER = 'GovernanceService' as const;
const SCHEMA_VERSION = '1.0' as const;

export interface GovernanceServiceOptions {
  readonly bus?: EventBus;
  readonly repositories?: GovernanceRepositories;
  /** Deterministic clock for replay/tests. */
  readonly now?: () => string;
}

export interface RegisterPolicyInput {
  readonly name: string;
  readonly description: string;
  readonly rules: readonly PolicyRule[];
  readonly authoredBy: string;
}

export interface RequestApprovalInput {
  readonly subjectId: CanonicalId;
  readonly reviewers: readonly string[];
  readonly mode: ApprovalMode;
  readonly escalated?: boolean;
  readonly policyVersion?: number;
}

export interface AssessRiskInput {
  readonly subjectId: CanonicalId;
  readonly level: RiskLevel;
  readonly impact: number;
  readonly likelihood: number;
  readonly mitigation: string;
  readonly assessedBy: string;
}

export interface CreateExceptionInput {
  readonly reason: string;
  readonly approver: string;
  readonly scope: string;
  readonly durationMs?: number;
}

export class GovernanceService {
  private readonly bus: EventBus;
  private readonly repos: GovernanceRepositories;
  private readonly now: () => string;

  constructor(options: GovernanceServiceOptions = {}) {
    // A dedicated catalog with the extra governance facts; the default kernel
    // catalog already carries the seeded governance families.
    this.bus = options.bus ?? new EventBus({ catalog: createGovernanceCatalog() });
    this.repos = options.repositories ?? createInMemoryRepositories();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Underlying bus (for in-monolith wiring / tests). */
  get eventBus(): EventBus {
    return this.bus;
  }

  // --- Policy registry (KMOS-0207) ---------------------------------------

  registerPolicy(input: RegisterPolicyInput): { policy: Policy; version: PolicyVersion } {
    const at = this.now();
    const policyId = newCanonicalId('Policy');
    const version = this.buildPolicyVersion(policyId, 1, input.rules, input.authoredBy, at);
    const policy = createCanonicalObject<Policy['body']>({
      id: policyId,
      type: 'Policy',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Active',
      displayName: input.name,
      body: {
        name: input.name,
        description: input.description,
        currentVersion: 1,
        versionIds: [version.id],
      },
      now: at,
    });
    this.repos.policies.putVersion(version);
    this.repos.policies.putPolicy(policy);
    void this.emit('PolicyRegistered', policyId, { policyId, name: input.name, version: 1 });
    return { policy, version };
  }

  /** Append a new IMMUTABLE policy version; prior versions are never mutated. */
  registerPolicyVersion(
    policyId: CanonicalId,
    rules: readonly PolicyRule[],
    authoredBy: string,
  ): PolicyVersion {
    const existing = this.repos.policies.getPolicy(policyId);
    if (!existing) {
      throw new KmosError(`No such policy: ${policyId}`, {
        category: 'NotFound',
        code: 'governance.policy.not_found',
        subject: policyId,
      });
    }
    const at = this.now();
    const nextVersion = existing.body.currentVersion + 1;
    const version = this.buildPolicyVersion(policyId, nextVersion, rules, authoredBy, at);
    this.repos.policies.putVersion(version);
    const updated: Policy = {
      ...existing,
      version: existing.version + 1,
      updatedAt: at,
      lifecycle: 'Updated',
      body: {
        ...existing.body,
        currentVersion: nextVersion,
        versionIds: [...existing.body.versionIds, version.id],
      },
    };
    this.repos.policies.putPolicy(updated);
    void this.emit('PolicyVersionRegistered', policyId, { policyId, version: nextVersion });
    return version;
  }

  getPolicy(policyId: CanonicalId): Policy | undefined {
    return this.repos.policies.getPolicy(policyId);
  }

  getPolicyVersions(policyId: CanonicalId): readonly PolicyVersion[] {
    return this.repos.policies.listVersions(policyId);
  }

  /** Deterministically evaluate a policy's current version against an input. */
  evaluatePolicy(policyId: CanonicalId, input: Readonly<Record<string, unknown>>): PolicyEvaluation {
    const policy = this.requirePolicy(policyId);
    const versions = this.repos.policies.listVersions(policyId);
    const current = versions.find((v) => v.body.version === policy.body.currentVersion);
    if (!current) {
      throw new KmosError(`Policy version missing: ${policyId}`, {
        category: 'NotFound',
        code: 'governance.policy.version_missing',
        subject: policyId,
      });
    }
    const { satisfied, reasons } = evaluateRules(current.body.rules, input);
    const at = this.now();
    void this.emit('PolicyEvaluated', policyId, {
      policyId,
      version: current.body.version,
      satisfied,
    });
    return { satisfied, policyId, version: current.body.version, reasons, evaluatedAt: at };
  }

  private buildPolicyVersion(
    policyId: CanonicalId,
    version: number,
    rules: readonly PolicyRule[],
    authoredBy: string,
    at: string,
  ): PolicyVersion {
    return createCanonicalObject<PolicyVersion['body']>({
      id: newCanonicalId('PolicyVersion'),
      type: 'PolicyVersion',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Active',
      displayName: `${policyId}@v${version}`,
      body: { policyId, version, rules, authoredBy, authoredAt: at },
      now: at,
    });
  }

  // --- Approvals (KMOS-0207) ---------------------------------------------

  requestApproval(input: RequestApprovalInput): Approval {
    if (input.reviewers.length === 0) {
      throw new KmosError('An approval requires at least one reviewer', {
        category: 'Validation',
        code: 'governance.approval.no_reviewers',
        subject: input.subjectId,
      });
    }
    const at = this.now();
    const approval = createCanonicalObject<Approval['body']>({
      id: newCanonicalId('Approval'),
      type: 'Approval',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Active',
      displayName: `Approval(${input.mode}) for ${input.subjectId}`,
      governance: { approvalState: 'Pending' },
      body: {
        subjectId: input.subjectId,
        mode: input.mode,
        reviewers: input.reviewers,
        state: 'Pending',
        decisions: [],
        escalated: input.escalated ?? false,
        ...(input.policyVersion !== undefined ? { policyVersion: input.policyVersion } : {}),
      },
      now: at,
    });
    this.repos.approvals.put(approval);
    void this.emit('ApprovalRequested', input.subjectId, {
      approvalId: approval.id,
      subjectId: input.subjectId,
      mode: input.mode,
      reviewers: input.reviewers,
      escalated: approval.body.escalated,
    });
    return approval;
  }

  grantApproval(approvalId: CanonicalId, reviewer: string, reason: string): Approval {
    return this.recordReviewerDecision(approvalId, reviewer, 'Granted', reason);
  }

  rejectApproval(approvalId: CanonicalId, reviewer: string, reason: string): Approval {
    return this.recordReviewerDecision(approvalId, reviewer, 'Rejected', reason);
  }

  private recordReviewerDecision(
    approvalId: CanonicalId,
    reviewer: string,
    verdict: ReviewerVerdict,
    reason: string,
  ): Approval {
    const current = this.repos.approvals.get(approvalId);
    if (!current) {
      throw new KmosError(`No such approval: ${approvalId}`, {
        category: 'NotFound',
        code: 'governance.approval.not_found',
        subject: approvalId,
      });
    }
    if (current.body.state !== 'Pending') {
      throw new KmosError(`Approval already ${current.body.state}`, {
        category: 'BusinessRule',
        code: 'governance.approval.not_pending',
        subject: approvalId,
        detail: { state: current.body.state },
      });
    }
    if (!current.body.reviewers.includes(reviewer)) {
      throw new KmosError(`Reviewer not assigned to this approval: ${reviewer}`, {
        category: 'Authorization',
        code: 'governance.approval.reviewer_not_assigned',
        subject: approvalId,
        detail: { reviewer },
      });
    }
    if (current.body.decisions.some((d) => d.reviewer === reviewer)) {
      throw new KmosError(`Reviewer already decided: ${reviewer}`, {
        category: 'Conflict',
        code: 'governance.approval.duplicate_decision',
        subject: approvalId,
        detail: { reviewer },
      });
    }
    const at = this.now();
    const decisions = [...current.body.decisions, { reviewer, verdict, reason, decidedAt: at }];
    const state = resolveApprovalState(current.body.mode, current.body.reviewers, decisions);
    const updated: Approval = {
      ...current,
      version: current.version + 1,
      updatedAt: at,
      lifecycle: state === 'Granted' ? 'Approved' : current.lifecycle,
      governance: { ...current.governance, approvalState: state },
      body: { ...current.body, state, decisions },
    };
    this.repos.approvals.put(updated);

    // Audit the individual reviewer decision (evidence preserved).
    this.recordAudit(
      current.body.subjectId,
      `ApprovalReviewerDecision:${verdict}`,
      reviewer,
      verdict,
      reason,
      [],
    );

    // When the approval reaches a terminal state, record a Decision + audit and
    // publish the corresponding governance fact.
    if (state === 'Granted') {
      this.recordDecision(
        current.body.subjectId,
        'Approval',
        'Granted',
        reviewer,
        reason,
        current.body.policyVersion,
      );
      void this.emit('ApprovalGranted', current.body.subjectId, {
        approvalId,
        subjectId: current.body.subjectId,
        reviewer,
        mode: current.body.mode,
      });
    } else if (state === 'Rejected') {
      this.recordDecision(
        current.body.subjectId,
        'Approval',
        'Rejected',
        reviewer,
        reason,
        current.body.policyVersion,
      );
      void this.emit('ApprovalRejected', current.body.subjectId, {
        approvalId,
        subjectId: current.body.subjectId,
        reviewer,
        reason,
      });
    }
    return updated;
  }

  getApproval(approvalId: CanonicalId): Approval | undefined {
    return this.repos.approvals.get(approvalId);
  }

  // --- Reviews (KMOS-0207) -----------------------------------------------

  createReview(subjectId: CanonicalId, reviewer: string): Review {
    const at = this.now();
    const review = createCanonicalObject<Review['body']>({
      id: newCanonicalId('Review'),
      type: 'Review',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Active',
      displayName: `Review of ${subjectId}`,
      body: { subjectId, reviewer, state: 'Open', evidence: [] },
      now: at,
    });
    this.repos.reviews.put(review);
    void this.emit('ReviewCreated', subjectId, { reviewId: review.id, subjectId, reviewer });
    return review;
  }

  completeReview(
    reviewId: CanonicalId,
    conclusion: ReviewConclusion,
    evidence: readonly string[],
  ): Review {
    const current = this.repos.reviews.get(reviewId);
    if (!current) {
      throw new KmosError(`No such review: ${reviewId}`, {
        category: 'NotFound',
        code: 'governance.review.not_found',
        subject: reviewId,
      });
    }
    if (current.body.state === 'Completed') {
      throw new KmosError('Review already completed', {
        category: 'BusinessRule',
        code: 'governance.review.already_completed',
        subject: reviewId,
      });
    }
    const at = this.now();
    const updated: Review = {
      ...current,
      version: current.version + 1,
      updatedAt: at,
      lifecycle: 'Reviewed',
      body: { ...current.body, state: 'Completed', conclusion, evidence, completedAt: at },
    };
    this.repos.reviews.put(updated);
    this.recordAudit(
      current.body.subjectId,
      'ReviewCompleted',
      current.body.reviewer,
      conclusion,
      `Conclusion ${conclusion}`,
      [],
    );
    void this.emit('ReviewCompleted', current.body.subjectId, {
      reviewId,
      subjectId: current.body.subjectId,
      conclusion,
      evidence,
    });
    return updated;
  }

  // --- Certification (KMOS-0207) -----------------------------------------

  grantCertification(
    subjectId: CanonicalId,
    level: CertificationLevel,
    authority: string,
  ): Certification {
    const at = this.now();
    const cert = createCanonicalObject<Certification['body']>({
      id: newCanonicalId('Certification'),
      type: 'Certification',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Approved',
      displayName: `Certification ${level} for ${subjectId}`,
      body: { subjectId, level, state: 'Granted', authority, grantedAt: at },
      now: at,
    });
    this.repos.certifications.add(cert);
    this.recordDecision(subjectId, 'Certification', `Granted:${level}`, authority, `Certified ${level}`, undefined);
    void this.emit('CertificationGranted', subjectId, {
      certificationId: cert.id,
      subjectId,
      level,
      authority,
    });
    return cert;
  }

  revokeCertification(certificationId: CanonicalId, authority: string, reason: string): Certification {
    const current = this.repos.certifications.get(certificationId);
    if (!current) {
      throw new KmosError(`No such certification: ${certificationId}`, {
        category: 'NotFound',
        code: 'governance.certification.not_found',
        subject: certificationId,
      });
    }
    if (current.body.state === 'Revoked') {
      throw new KmosError('Certification already revoked', {
        category: 'BusinessRule',
        code: 'governance.certification.already_revoked',
        subject: certificationId,
      });
    }
    const at = this.now();
    const revoked: Certification = {
      ...current,
      version: current.version + 1,
      updatedAt: at,
      lifecycle: 'Retired',
      body: { ...current.body, state: 'Revoked', revokedAt: at, revocationReason: reason },
    };
    // Append-only history: the revoked record is added as a new history entry.
    this.repos.certifications.add(revoked);
    this.recordDecision(
      current.body.subjectId,
      'Certification',
      `Revoked:${current.body.level}`,
      authority,
      reason,
      undefined,
    );
    void this.emit('CertificationRevoked', current.body.subjectId, {
      certificationId,
      subjectId: current.body.subjectId,
      level: current.body.level,
      reason,
    });
    return revoked;
  }

  getCertificationHistory(subjectId: CanonicalId): readonly Certification[] {
    return this.repos.certifications.history(subjectId);
  }

  getCurrentCertification(subjectId: CanonicalId): Certification | undefined {
    return this.repos.certifications.current(subjectId);
  }

  // --- Compliance (KMOS-0207) --------------------------------------------

  recordCompliance(
    subjectId: CanonicalId,
    framework: string,
    result: ComplianceResult,
    verifiedBy: string,
    evidence: readonly string[] = [],
  ): ComplianceRecord {
    const at = this.now();
    const record = createCanonicalObject<ComplianceRecord['body']>({
      id: newCanonicalId('ComplianceRecord'),
      type: 'ComplianceRecord',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Active',
      displayName: `${framework} compliance for ${subjectId}`,
      body: { subjectId, framework, result, evidence, verifiedBy, verifiedAt: at },
      now: at,
    });
    this.repos.compliance.add(record);
    this.recordAudit(subjectId, 'ComplianceVerified', verifiedBy, result, `Framework ${framework}`, []);
    void this.emit('ComplianceVerified', subjectId, {
      complianceRecordId: record.id,
      subjectId,
      framework,
      result,
    });
    return record;
  }

  getComplianceRecords(subjectId: CanonicalId): readonly ComplianceRecord[] {
    return this.repos.compliance.forSubject(subjectId);
  }

  // --- Risk (KMOS-0207) --------------------------------------------------

  assessRisk(input: AssessRiskInput): RiskAssessment {
    const at = this.now();
    const { inherentRisk, residualRisk } = computeRisk(input.level, input.impact, input.likelihood);
    const assessment = createCanonicalObject<RiskAssessment['body']>({
      id: newCanonicalId('RiskAssessment'),
      type: 'RiskAssessment',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Active',
      displayName: `Risk(${input.level}) for ${input.subjectId}`,
      body: {
        subjectId: input.subjectId,
        level: input.level,
        impact: input.impact,
        likelihood: input.likelihood,
        mitigation: input.mitigation,
        inherentRisk,
        residualRisk,
        assessedBy: input.assessedBy,
        assessedAt: at,
      },
      now: at,
    });
    this.repos.risks.add(assessment);
    this.recordAudit(
      input.subjectId,
      'RiskAssessed',
      input.assessedBy,
      input.level,
      `inherent=${inherentRisk}, residual=${residualRisk}`,
      [],
    );
    void this.emit('RiskAssessed', input.subjectId, {
      riskAssessmentId: assessment.id,
      subjectId: input.subjectId,
      level: input.level,
      inherentRisk,
      residualRisk,
    });
    return assessment;
  }

  getRiskAssessments(subjectId: CanonicalId): readonly RiskAssessment[] {
    return this.repos.risks.forSubject(subjectId);
  }

  // --- Exceptions (KMOS-0207) --------------------------------------------

  createException(input: CreateExceptionInput): Exception {
    const at = this.now();
    const expiresAt =
      input.durationMs !== undefined
        ? new Date(new Date(at).getTime() + input.durationMs).toISOString()
        : undefined;
    const exception = createCanonicalObject<Exception['body']>({
      id: newCanonicalId('Exception'),
      type: 'Exception',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Active',
      displayName: `Exception(${input.scope})`,
      body: {
        reason: input.reason,
        approver: input.approver,
        scope: input.scope,
        state: 'Open',
        openedAt: at,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      },
      now: at,
    });
    this.repos.exceptions.put(exception);
    this.recordAudit(
      newCanonicalId('GovernanceSubject'),
      'ExceptionCreated',
      input.approver,
      'Open',
      input.reason,
      [],
    );
    void this.emit('ExceptionCreated', exception.id, {
      exceptionId: exception.id,
      scope: input.scope,
      approver: input.approver,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    });
    return exception;
  }

  closeException(exceptionId: CanonicalId, closeReason: string): Exception {
    const current = this.repos.exceptions.get(exceptionId);
    if (!current) {
      throw new KmosError(`No such exception: ${exceptionId}`, {
        category: 'NotFound',
        code: 'governance.exception.not_found',
        subject: exceptionId,
      });
    }
    if (current.body.state === 'Closed') {
      throw new KmosError('Exception already closed', {
        category: 'BusinessRule',
        code: 'governance.exception.already_closed',
        subject: exceptionId,
      });
    }
    const at = this.now();
    const updated: Exception = {
      ...current,
      version: current.version + 1,
      updatedAt: at,
      lifecycle: 'Retired',
      body: { ...current.body, state: 'Closed', closedAt: at, closeReason },
    };
    this.repos.exceptions.put(updated);
    void this.emit('ExceptionClosed', exceptionId, { exceptionId, closeReason });
    return updated;
  }

  getException(exceptionId: CanonicalId): Exception | undefined {
    return this.repos.exceptions.get(exceptionId);
  }

  listExceptions(): readonly Exception[] {
    return this.repos.exceptions.list();
  }

  // --- Trust assessment (KMOS-0207) --------------------------------------

  /**
   * Assess trust for a subject from supplied EVIDENCE only. Returns an
   * explainable result `{ trusted, score, reasons }`. Evidence is never gathered
   * by calling other services (constitution §4); callers pass it in. The reasons
   * array makes the decision fully auditable — trust never relies on
   * undocumented judgment (KMOS-0207 acceptance criterion).
   */
  assessTrust(args: { subjectId: CanonicalId; evidence: TrustEvidence; threshold?: number }): TrustResult {
    const result =
      args.threshold !== undefined ? deriveTrust(args.evidence, args.threshold) : deriveTrust(args.evidence);
    this.recordAudit(
      args.subjectId,
      'TrustAssessed',
      PRODUCER,
      result.trusted ? 'Trusted' : 'NotTrusted',
      result.reasons.join('; '),
      [],
    );
    void this.emit('TrustAssessmentCompleted', args.subjectId, {
      subjectId: args.subjectId,
      trusted: result.trusted,
      score: result.score,
      reasons: result.reasons,
    });
    return result;
  }

  // --- Decision / audit access -------------------------------------------

  getDecisions(subjectId: CanonicalId): readonly Decision[] {
    return this.repos.decisions.forSubject(subjectId);
  }

  getAuditLog(): readonly GovernanceAudit[] {
    return this.repos.audits.all();
  }

  getAuditTrail(subjectId: CanonicalId): readonly GovernanceAudit[] {
    return this.repos.audits.forSubject(subjectId);
  }

  // --- Internal helpers --------------------------------------------------

  private requirePolicy(policyId: CanonicalId): Policy {
    const policy = this.repos.policies.getPolicy(policyId);
    if (!policy) {
      throw new KmosError(`No such policy: ${policyId}`, {
        category: 'NotFound',
        code: 'governance.policy.not_found',
        subject: policyId,
      });
    }
    return policy;
  }

  /** Record an immutable Decision capturing reason/authority/policy version/time. */
  private recordDecision(
    subjectId: CanonicalId,
    decisionType: string,
    outcome: string,
    authority: string,
    reason: string,
    policyVersion: number | undefined,
  ): Decision {
    const at = this.now();
    const decision = createCanonicalObject<Decision['body']>({
      id: newCanonicalId('Decision'),
      type: 'Decision',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Active',
      displayName: `${decisionType} ${outcome}`,
      body: {
        subjectId,
        decisionType,
        outcome,
        authority,
        reason,
        evidenceRefs: [],
        ...(policyVersion !== undefined ? { policyVersion } : {}),
        decidedAt: at,
      },
      now: at,
    });
    this.repos.decisions.add(decision);
    // Every governance decision produces an immutable audit record.
    this.recordAudit(subjectId, decisionType, authority, outcome, reason, []);
    return decision;
  }

  /** Append an immutable GovernanceAudit record (constitution §9: evidence). */
  private recordAudit(
    subjectId: CanonicalId,
    action: string,
    actor: string,
    outcome: string,
    reason: string,
    evidenceRefs: readonly CanonicalId[],
  ): GovernanceAudit {
    const at = this.now();
    const audit = createCanonicalObject<GovernanceAudit['body']>({
      id: newCanonicalId('GovernanceAudit'),
      type: 'GovernanceAudit',
      schemaVersion: SCHEMA_VERSION,
      owner: OWNER,
      lifecycle: 'Preserved',
      displayName: `${action} on ${subjectId}`,
      body: { subjectId, action, actor, outcome, reason, evidenceRefs, recordedAt: at },
      now: at,
    });
    this.repos.audits.add(audit);
    return audit;
  }

  /** Publish a canonical governance event onto the bus (validated by the catalog). */
  private async emit(
    type: string,
    subjectId: CanonicalId,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event = createEvent({
      type,
      schemaVersion: SCHEMA_VERSION,
      producer: PRODUCER,
      subjectId,
      payload,
      time: this.now(),
    });
    await this.bus.publish(event, { streamId: subjectId });
  }
}
