/**
 * In-memory governance repositories (constitution §2: the modular-monolith-first
 * adapters behind the domain ports). Zero runtime dependencies; pure data
 * structures. A Postgres adapter will later implement the same ports without
 * changing the application core. Append-only stores (certifications, decisions,
 * audits) never mutate prior records — history is immutable.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type {
  Approval,
  Certification,
  ComplianceRecord,
  Decision,
  Exception,
  GovernanceAudit,
  Policy,
  PolicyVersion,
  Review,
  RiskAssessment,
} from '../domain/model.js';
import type {
  ApprovalRepository,
  AuditRepository,
  CertificationRepository,
  ComplianceRepository,
  DecisionRepository,
  ExceptionRepository,
  GovernanceRepositories,
  PolicyRepository,
  ReviewRepository,
  RiskRepository,
} from '../domain/ports.js';

class InMemoryPolicyRepository implements PolicyRepository {
  private readonly policies = new Map<CanonicalId, Policy>();
  private readonly versions = new Map<CanonicalId, PolicyVersion>();

  putPolicy(policy: Policy): void {
    this.policies.set(policy.id, policy);
  }
  getPolicy(id: CanonicalId): Policy | undefined {
    return this.policies.get(id);
  }
  putVersion(version: PolicyVersion): void {
    this.versions.set(version.id, version);
  }
  getVersion(id: CanonicalId): PolicyVersion | undefined {
    return this.versions.get(id);
  }
  listVersions(policyId: CanonicalId): readonly PolicyVersion[] {
    return [...this.versions.values()]
      .filter((v) => v.body.policyId === policyId)
      .sort((a, b) => a.body.version - b.body.version);
  }
}

class InMemoryApprovalRepository implements ApprovalRepository {
  private readonly byId = new Map<CanonicalId, Approval>();
  put(approval: Approval): void {
    this.byId.set(approval.id, approval);
  }
  get(id: CanonicalId): Approval | undefined {
    return this.byId.get(id);
  }
}

class InMemoryReviewRepository implements ReviewRepository {
  private readonly byId = new Map<CanonicalId, Review>();
  put(review: Review): void {
    this.byId.set(review.id, review);
  }
  get(id: CanonicalId): Review | undefined {
    return this.byId.get(id);
  }
}

class InMemoryCertificationRepository implements CertificationRepository {
  private readonly byId = new Map<CanonicalId, Certification>();
  private readonly bySubject = new Map<CanonicalId, Certification[]>();

  add(certification: Certification): void {
    this.byId.set(certification.id, certification);
    const list = this.bySubject.get(certification.body.subjectId) ?? [];
    list.push(certification);
    this.bySubject.set(certification.body.subjectId, list);
  }
  get(id: CanonicalId): Certification | undefined {
    return this.byId.get(id);
  }
  history(subjectId: CanonicalId): readonly Certification[] {
    return [...(this.bySubject.get(subjectId) ?? [])];
  }
  current(subjectId: CanonicalId): Certification | undefined {
    const list = this.bySubject.get(subjectId);
    return list && list.length > 0 ? list[list.length - 1] : undefined;
  }
}

class InMemoryComplianceRepository implements ComplianceRepository {
  private readonly bySubject = new Map<CanonicalId, ComplianceRecord[]>();
  add(record: ComplianceRecord): void {
    const list = this.bySubject.get(record.body.subjectId) ?? [];
    list.push(record);
    this.bySubject.set(record.body.subjectId, list);
  }
  forSubject(subjectId: CanonicalId): readonly ComplianceRecord[] {
    return [...(this.bySubject.get(subjectId) ?? [])];
  }
}

class InMemoryRiskRepository implements RiskRepository {
  private readonly byId = new Map<CanonicalId, RiskAssessment>();
  private readonly bySubject = new Map<CanonicalId, RiskAssessment[]>();
  add(assessment: RiskAssessment): void {
    this.byId.set(assessment.id, assessment);
    const list = this.bySubject.get(assessment.body.subjectId) ?? [];
    list.push(assessment);
    this.bySubject.set(assessment.body.subjectId, list);
  }
  get(id: CanonicalId): RiskAssessment | undefined {
    return this.byId.get(id);
  }
  forSubject(subjectId: CanonicalId): readonly RiskAssessment[] {
    return [...(this.bySubject.get(subjectId) ?? [])];
  }
}

class InMemoryExceptionRepository implements ExceptionRepository {
  private readonly byId = new Map<CanonicalId, Exception>();
  put(exception: Exception): void {
    this.byId.set(exception.id, exception);
  }
  get(id: CanonicalId): Exception | undefined {
    return this.byId.get(id);
  }
  list(): readonly Exception[] {
    return [...this.byId.values()];
  }
}

class InMemoryDecisionRepository implements DecisionRepository {
  private readonly all: Decision[] = [];
  add(decision: Decision): void {
    this.all.push(decision);
  }
  forSubject(subjectId: CanonicalId): readonly Decision[] {
    return this.all.filter((d) => d.body.subjectId === subjectId);
  }
}

class InMemoryAuditRepository implements AuditRepository {
  private readonly entries: GovernanceAudit[] = [];
  add(audit: GovernanceAudit): void {
    this.entries.push(audit);
  }
  all(): readonly GovernanceAudit[] {
    return [...this.entries];
  }
  forSubject(subjectId: CanonicalId): readonly GovernanceAudit[] {
    return this.entries.filter((a) => a.body.subjectId === subjectId);
  }
}

/** Construct a complete set of in-memory governance repositories. */
export function createInMemoryRepositories(): GovernanceRepositories {
  return {
    policies: new InMemoryPolicyRepository(),
    approvals: new InMemoryApprovalRepository(),
    reviews: new InMemoryReviewRepository(),
    certifications: new InMemoryCertificationRepository(),
    compliance: new InMemoryComplianceRepository(),
    risks: new InMemoryRiskRepository(),
    exceptions: new InMemoryExceptionRepository(),
    decisions: new InMemoryDecisionRepository(),
    audits: new InMemoryAuditRepository(),
  };
}
