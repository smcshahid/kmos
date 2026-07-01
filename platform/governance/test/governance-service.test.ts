import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, newCanonicalId, type StoredEvent } from '@kmos/canonical-kernel';
import { GovernanceService, createGovernanceCatalog } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** Capture every event published by the service for event-level assertions. */
function withCapture(svc: GovernanceService): string[] {
  const types: string[] = [];
  svc.eventBus.subscribe({
    subscriber: 'test-capture',
    eventTypes: ['*'],
    handler: (s: StoredEvent) => {
      types.push(s.event.identity.type);
    },
  });
  return types;
}

test('Policy: registration + immutable versioning + evaluation (KMOS-0207)', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);

  const { policy, version } = await svc.registerPolicy({
    name: 'PublishGate',
    description: 'Must be approved and integrity-verified',
    rules: [
      { field: 'approved', operator: 'truthy', description: 'subject approved' },
      { field: 'integrity', operator: 'eq', value: 'verified', description: 'integrity verified' },
    ],
    authoredBy: 'alice',
  });
  assert.equal(policy.body.currentVersion, 1);
  assert.equal(version.body.version, 1);

  // New immutable version; prior version object is unchanged.
  const v2 = await svc.registerPolicyVersion(
    policy.id,
    [{ field: 'approved', operator: 'truthy' }],
    'bob',
  );
  assert.equal(v2.body.version, 2);
  const versions = svc.getPolicyVersions(policy.id);
  assert.equal(versions.length, 2);
  assert.equal(versions[0]!.body.rules.length, 2, 'v1 rules are immutable / preserved');
  assert.equal(svc.getPolicy(policy.id)!.body.currentVersion, 2);

  // Evaluation is deterministic and explainable against the CURRENT version (v2).
  const passEval = await svc.evaluatePolicy(policy.id, { approved: true });
  assert.equal(passEval.satisfied, true);
  const failEval = await svc.evaluatePolicy(policy.id, { approved: false });
  assert.equal(failEval.satisfied, false);
  assert.ok(failEval.reasons.some((r) => r.startsWith('FAIL')));

  assert.ok(events.includes('PolicyRegistered'));
  assert.ok(events.includes('PolicyVersionRegistered'));
  assert.ok(events.includes('PolicyEvaluated'));
});

test('Approval: single-reviewer grant produces audit + Decision + event (KMOS-0207)', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);
  const subjectId = newCanonicalId('Asset');

  const approval = await svc.requestApproval({ subjectId, reviewers: ['alice'], mode: 'Single' });
  assert.equal(approval.body.state, 'Pending');
  assert.ok(events.includes('ApprovalRequested'));

  const granted = await svc.grantApproval(approval.id, 'alice', 'looks good');
  assert.equal(granted.body.state, 'Granted');
  assert.equal(granted.lifecycle, 'Approved');
  assert.ok(events.includes('ApprovalGranted'));

  // A Decision and an immutable audit trail were recorded with the reason preserved.
  const decisions = svc.getDecisions(subjectId);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]!.body.outcome, 'Granted');
  assert.equal(decisions[0]!.body.reason, 'looks good');
  assert.ok(svc.getAuditTrail(subjectId).length >= 1);
});

test('Approval: reject ends the approval and publishes ApprovalRejected', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);
  const subjectId = newCanonicalId('Asset');

  const approval = await svc.requestApproval({ subjectId, reviewers: ['alice', 'bob'], mode: 'MultipleAll' });
  const rejected = await svc.rejectApproval(approval.id, 'alice', 'fails policy');
  assert.equal(rejected.body.state, 'Rejected');
  assert.ok(events.includes('ApprovalRejected'));

  // No further decisions are allowed on a terminal approval.
  await assert.rejects(() => svc.grantApproval(approval.id, 'bob', 'too late'), /already/);
});

test('Approval: MultipleAll completes only when ALL reviewers approve', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const subjectId = newCanonicalId('Asset');
  const approval = await svc.requestApproval({
    subjectId,
    reviewers: ['alice', 'bob', 'carol'],
    mode: 'MultipleAll',
  });

  let state = await svc.grantApproval(approval.id, 'alice', 'ok');
  assert.equal(state.body.state, 'Pending', 'one of three: still pending');
  state = await svc.grantApproval(approval.id, 'bob', 'ok');
  assert.equal(state.body.state, 'Pending', 'two of three: still pending');
  state = await svc.grantApproval(approval.id, 'carol', 'ok');
  assert.equal(state.body.state, 'Granted', 'all three: granted');

  // A reviewer cannot vote twice.
  await assert.rejects(() => svc.grantApproval(approval.id, 'alice', 'again'), /already/);
});

test('Approval: escalation flag is preserved', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const subjectId = newCanonicalId('Asset');
  const approval = await svc.requestApproval({
    subjectId,
    reviewers: ['alice'],
    mode: 'Single',
    escalated: true,
  });
  assert.equal(approval.body.escalated, true);
});

test('Review: create + complete preserves supporting evidence', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);
  const subjectId = newCanonicalId('KnowledgeObject');

  const review = await svc.createReview(subjectId, 'editor');
  const done = await svc.completeReview(review.id, 'Pass', ['source verified', 'two citations checked']);
  assert.equal(done.body.state, 'Completed');
  assert.equal(done.body.conclusion, 'Pass');
  assert.deepEqual(done.body.evidence, ['source verified', 'two citations checked']);
  assert.ok(events.includes('ReviewCompleted'));
});

test('Certification: grant + revoke + history (KMOS-0207)', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);
  const subjectId = newCanonicalId('Capability');

  const cert = await svc.grantCertification(subjectId, 'Gold', 'cert-authority');
  assert.equal(cert.body.state, 'Granted');
  assert.equal(svc.getCurrentCertification(subjectId)!.body.level, 'Gold');
  assert.ok(events.includes('CertificationGranted'));

  const revoked = await svc.revokeCertification(cert.id, 'cert-authority', 'capability deprecated');
  assert.equal(revoked.body.state, 'Revoked');
  assert.equal(revoked.body.revocationReason, 'capability deprecated');
  assert.ok(events.includes('CertificationRevoked'));

  // History keeps both the grant and the revocation (append-only, immutable).
  const history = svc.getCertificationHistory(subjectId);
  assert.equal(history.length, 2);
  assert.equal(history[0]!.body.state, 'Granted');
  assert.equal(history[1]!.body.state, 'Revoked');
});

test('Compliance: record produces ComplianceRecord + event', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);
  const subjectId = newCanonicalId('Asset');

  const record = await svc.recordCompliance(subjectId, 'GDPR', 'Compliant', 'dpo', ['DPIA filed']);
  assert.equal(record.body.framework, 'GDPR');
  assert.equal(record.body.result, 'Compliant');
  assert.deepEqual(record.body.evidence, ['DPIA filed']);
  assert.equal(svc.getComplianceRecords(subjectId).length, 1);
  assert.ok(events.includes('ComplianceVerified'));
});

test('Risk: assessment computes residual risk and is queryable (KMOS-0207)', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);
  const subjectId = newCanonicalId('Workflow');

  const risk = await svc.assessRisk({
    subjectId,
    level: 'High',
    impact: 4,
    likelihood: 3,
    mitigation: 'access controls + monitoring',
    assessedBy: 'risk-officer',
  });
  assert.equal(risk.body.inherentRisk, 12);
  // Residual must be lower than inherent (mitigation reduces it) but > 0.
  assert.ok(risk.body.residualRisk < risk.body.inherentRisk);
  assert.ok(risk.body.residualRisk > 0);
  assert.equal(svc.getRiskAssessments(subjectId).length, 1);
  assert.ok(events.includes('RiskAssessed'));
});

test('Exception: create + close lifecycle is visible throughout (KMOS-0207)', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);

  const exc = await svc.createException({
    reason: 'temporary waiver for migration',
    approver: 'cto',
    scope: 'asset:legacy-import',
    durationMs: 86_400_000,
  });
  assert.equal(exc.body.state, 'Open');
  assert.ok(exc.body.expiresAt, 'duration yields an expiry');
  assert.equal(svc.listExceptions().length, 1);
  assert.ok(events.includes('ExceptionCreated'));

  const closed = await svc.closeException(exc.id, 'migration complete');
  assert.equal(closed.body.state, 'Closed');
  assert.equal(closed.body.closeReason, 'migration complete');
  assert.ok(events.includes('ExceptionClosed'));

  // Visible throughout lifecycle.
  assert.equal(svc.getException(exc.id)!.body.state, 'Closed');
});

test('Trust: assessTrust returns explainable reasons for trusted input (KMOS-0207)', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const events = withCapture(svc);
  const subjectId = newCanonicalId('Asset');

  const result = await svc.assessTrust({
    subjectId,
    evidence: {
      knowledgeProvenance: true,
      assetIntegrity: true,
      workflowCompletion: true,
      capabilityCertification: true,
      reviewerApproval: true,
      policyCompliance: true,
      identityVerification: true,
    },
  });
  assert.equal(result.trusted, true);
  assert.equal(result.score, 1);
  // Explainability: a reason per dimension plus a summary line.
  assert.ok(result.reasons.length >= 7);
  assert.ok(result.reasons.some((r) => r.includes('TRUSTED')));
  assert.ok(events.includes('TrustAssessmentCompleted'));
});

test('Trust: assessTrust explains an UNTRUSTED decision (KMOS-0207)', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const subjectId = newCanonicalId('Asset');

  // Mandatory evidence (identity, policy compliance) missing -> not trusted,
  // and every gap is explained (never undocumented judgment).
  const result = await svc.assessTrust({
    subjectId,
    evidence: { knowledgeProvenance: true, assetIntegrity: false },
  });
  assert.equal(result.trusted, false);
  assert.ok(result.score < 1);
  assert.ok(result.reasons.some((r) => r.includes('identity verified') && r.includes('no evidence')));
  assert.ok(result.reasons.some((r) => r.includes('asset integrity') && r.includes('negative')));
  assert.ok(result.reasons.some((r) => r.includes('NOT TRUSTED')));
});

test('Audit: every governance decision yields an immutable audit record', async () => {
  const svc = new GovernanceService({ now: fixedNow });
  const subjectId = newCanonicalId('Asset');

  await svc.grantCertification(subjectId, 'Silver', 'authority');
  await svc.recordCompliance(subjectId, 'SOC2', 'Compliant', 'auditor');
  const trail = svc.getAuditTrail(subjectId);
  assert.ok(trail.length >= 2);
  for (const entry of trail) {
    assert.equal(entry.type, 'GovernanceAudit');
    assert.ok(entry.body.recordedAt);
    assert.ok(entry.body.reason !== undefined);
  }
});

test('Recovery: a fresh service rebuilds every repo from the durable log (ADR-0011)', async () => {
  // A SHARED, durable bus so a second service instance sees the same event log.
  const bus = new EventBus({ catalog: createGovernanceCatalog() });

  // s1 performs representative writes across every persisted object type.
  const s1 = new GovernanceService({ bus, now: fixedNow });

  // Policy + immutable version.
  const { policy } = await s1.registerPolicy({
    name: 'PublishGate',
    description: 'Must be approved',
    rules: [{ field: 'approved', operator: 'truthy' }],
    authoredBy: 'alice',
  });
  await s1.registerPolicyVersion(policy.id, [{ field: 'approved', operator: 'truthy' }], 'bob');

  // Approval requested then granted (mutated in place; final head = Granted).
  const approvalSubject = newCanonicalId('Asset');
  const approval = await s1.requestApproval({
    subjectId: approvalSubject,
    reviewers: ['alice'],
    mode: 'Single',
  });
  await s1.grantApproval(approval.id, 'alice', 'looks good');

  // Certification granted then revoked (append-only history: 2 records).
  const certSubject = newCanonicalId('Capability');
  const cert = await s1.grantCertification(certSubject, 'Gold', 'cert-authority');
  await s1.revokeCertification(cert.id, 'cert-authority', 'deprecated');

  // Review, compliance, risk, exception.
  const reviewSubject = newCanonicalId('KnowledgeObject');
  const review = await s1.createReview(reviewSubject, 'editor');
  await s1.completeReview(review.id, 'Pass', ['source verified']);

  const complianceSubject = newCanonicalId('Asset');
  await s1.recordCompliance(complianceSubject, 'GDPR', 'Compliant', 'dpo', ['DPIA filed']);

  const riskSubject = newCanonicalId('Workflow');
  await s1.assessRisk({
    subjectId: riskSubject,
    level: 'High',
    impact: 4,
    likelihood: 3,
    mitigation: 'controls',
    assessedBy: 'risk-officer',
  });

  const exception = await s1.createException({
    reason: 'temporary waiver',
    approver: 'cto',
    scope: 'asset:legacy',
    durationMs: 86_400_000,
  });
  await s1.closeException(exception.id, 'migration complete');

  // A FRESH service on the SAME bus starts with empty read models.
  const s2 = new GovernanceService({ bus, now: fixedNow });
  assert.equal(s2.getPolicy(policy.id), undefined, 'read model empty before hydrate');
  assert.equal(s2.getApproval(approval.id), undefined);
  assert.equal(s2.getCertificationHistory(certSubject).length, 0);
  assert.equal(s2.getException(exception.id), undefined);
  assert.equal(s2.getRiskAssessments(riskSubject).length, 0);
  assert.equal(s2.getComplianceRecords(complianceSubject).length, 0);
  assert.equal(s2.getDecisions(approvalSubject).length, 0);
  assert.equal(s2.getAuditLog().length, 0);

  // Rebuild every repository from the durable event log.
  await s2.hydrate();

  // Post-restart queries are IDENTICAL to the original service.
  assert.deepEqual(s2.getPolicy(policy.id), s1.getPolicy(policy.id));
  assert.deepEqual(s2.getPolicyVersions(policy.id), s1.getPolicyVersions(policy.id));
  assert.equal(s2.getPolicyVersions(policy.id).length, 2);

  assert.deepEqual(s2.getApproval(approval.id), s1.getApproval(approval.id));
  assert.equal(s2.getApproval(approval.id)!.body.state, 'Granted');

  assert.deepEqual(
    s2.getCertificationHistory(certSubject),
    s1.getCertificationHistory(certSubject),
  );
  assert.equal(s2.getCertificationHistory(certSubject).length, 2);
  assert.equal(s2.getCurrentCertification(certSubject)!.body.state, 'Revoked');

  assert.deepEqual(
    s2.getComplianceRecords(complianceSubject),
    s1.getComplianceRecords(complianceSubject),
  );
  assert.deepEqual(s2.getRiskAssessments(riskSubject), s1.getRiskAssessments(riskSubject));

  assert.deepEqual(s2.getException(exception.id), s1.getException(exception.id));
  assert.equal(s2.getException(exception.id)!.body.state, 'Closed');
  assert.deepEqual(s2.listExceptions(), s1.listExceptions());

  // Append-only side records (Decisions + immutable audit log) rebuild identically.
  assert.deepEqual(s2.getDecisions(approvalSubject), s1.getDecisions(approvalSubject));
  assert.deepEqual(s2.getDecisions(certSubject), s1.getDecisions(certSubject));
  assert.equal(s2.getAuditLog().length, s1.getAuditLog().length);
  assert.deepEqual(s2.getAuditTrail(certSubject), s1.getAuditTrail(certSubject));
});
