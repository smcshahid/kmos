/**
 * Governance repository PORTS (constitution §2: ports-and-adapters).
 *
 * The application core depends only on these interfaces. The in-memory adapters
 * live in `infrastructure/` and may be swapped for a Postgres adapter without
 * touching the application or domain. Stores keep immutable history where the
 * domain requires it (certification history, audit log).
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
} from './model.js';

export interface PolicyRepository {
  putPolicy(policy: Policy): void;
  getPolicy(id: CanonicalId): Policy | undefined;
  putVersion(version: PolicyVersion): void;
  getVersion(id: CanonicalId): PolicyVersion | undefined;
  listVersions(policyId: CanonicalId): readonly PolicyVersion[];
}

export interface ApprovalRepository {
  put(approval: Approval): void;
  get(id: CanonicalId): Approval | undefined;
}

export interface ReviewRepository {
  put(review: Review): void;
  get(id: CanonicalId): Review | undefined;
}

export interface CertificationRepository {
  add(certification: Certification): void;
  get(id: CanonicalId): Certification | undefined;
  /** Full append-only history for a subject, oldest first. */
  history(subjectId: CanonicalId): readonly Certification[];
  current(subjectId: CanonicalId): Certification | undefined;
}

export interface ComplianceRepository {
  add(record: ComplianceRecord): void;
  forSubject(subjectId: CanonicalId): readonly ComplianceRecord[];
}

export interface RiskRepository {
  add(assessment: RiskAssessment): void;
  get(id: CanonicalId): RiskAssessment | undefined;
  forSubject(subjectId: CanonicalId): readonly RiskAssessment[];
}

export interface ExceptionRepository {
  put(exception: Exception): void;
  get(id: CanonicalId): Exception | undefined;
  list(): readonly Exception[];
}

export interface DecisionRepository {
  add(decision: Decision): void;
  forSubject(subjectId: CanonicalId): readonly Decision[];
}

/** Append-only, immutable audit log of every governance decision. */
export interface AuditRepository {
  add(audit: GovernanceAudit): void;
  all(): readonly GovernanceAudit[];
  forSubject(subjectId: CanonicalId): readonly GovernanceAudit[];
}

/** Aggregate of all governance repositories injected into the service. */
export interface GovernanceRepositories {
  readonly policies: PolicyRepository;
  readonly approvals: ApprovalRepository;
  readonly reviews: ReviewRepository;
  readonly certifications: CertificationRepository;
  readonly compliance: ComplianceRepository;
  readonly risks: RiskRepository;
  readonly exceptions: ExceptionRepository;
  readonly decisions: DecisionRepository;
  readonly audits: AuditRepository;
}
