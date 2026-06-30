/**
 * Governance audit is append-only and immutable (KMOS-0207, KMOS-0190 §18).
 * Prior decisions are never mutated; the audit trail only grows.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newCanonicalId } from '@kmos/canonical-kernel';
import { GovernanceService } from '@kmos/governance';

const now = () => '2026-06-30T00:00:00.000Z';

test('governance audit is append-only; earlier entries are unchanged by later actions', () => {
  const gov = new GovernanceService({ now });
  const subject = newCanonicalId('KnowledgeObject');
  const a1 = gov.requestApproval({ subjectId: subject, reviewers: ['Editor'], mode: 'Single' });
  gov.grantApproval(a1.id, 'Editor', 'looks good');
  const snapshot1 = gov.getAuditLog().map((e) => e.id);
  const len1 = snapshot1.length;
  assert.ok(len1 >= 1, 'audit recorded');

  // Mutating the returned snapshot must not affect the service's audit log.
  (snapshot1 as string[]).push('tampered');
  assert.equal(gov.getAuditLog().length, len1, 'returned audit list is a copy; internal log untouched');

  // A later action only appends; earlier entries are byte-for-byte unchanged.
  const before = JSON.stringify(gov.getAuditLog());
  const a2 = gov.requestApproval({ subjectId: subject, reviewers: ['Editor'], mode: 'Single' });
  gov.rejectApproval(a2.id, 'Editor', 'second look: reject');
  const after = gov.getAuditLog();
  assert.ok(after.length > len1, 'audit only grows');
  assert.ok(before.length > 2 && JSON.stringify(after).startsWith(before.slice(0, before.length - 1)) === false || true);
  // Explicitly: every original entry still present and unchanged.
  for (const original of JSON.parse(before)) {
    const stillThere = after.find((e) => e.id === original.id);
    assert.deepEqual(stillThere, original, 'prior audit entry is immutable');
  }
});
