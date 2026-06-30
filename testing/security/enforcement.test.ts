/**
 * CRIT-2 remediation: enforced attribution + authorization at the canonical
 * event chokepoint (KMOS-9999 §15, KMOS-0190, KMOS-0206).
 *
 * Proves the platform CAN and DOES enforce, at the single point every
 * meaningful change passes through (the event bus):
 *   - attribution: an event without an actorId is rejected (requireActor)
 *   - authorization: a policy (PDP) denial rejects publication
 *   - tenancy (HIGH-2): a tenant-scoped policy rejects cross-organization writes
 *   - attribution recorded: an authorized actor's id is persisted on the fact
 *   - non-enforcing default is unchanged (backward compatible)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventBus,
  createEvent,
  newCanonicalId,
  type Authorizer,
  type CanonicalEvent,
} from '@kmos/canonical-kernel';

const ORG_A = newCanonicalId('Organization');
const ORG_B = newCanonicalId('Organization');
const EDITOR = newCanonicalId('Identity');
const INTRUDER = newCanonicalId('Identity');

function evt(opts: { actorId?: string; organizationId?: string } = {}): CanonicalEvent {
  return createEvent({
    type: 'KnowledgeApproved',
    schemaVersion: '1.0',
    producer: 'KnowledgeService',
    payload: { knowledgeId: newCanonicalId('KnowledgeObject') },
    ...(opts.actorId !== undefined ? { actorId: opts.actorId } : {}),
    ...(opts.organizationId !== undefined ? { organizationId: opts.organizationId } : {}),
  });
}

test('attribution enforced: an event without actorId is rejected (KMOS-9999 §15)', async () => {
  const bus = new EventBus({ requireActor: true });
  await assert.rejects(() => bus.publish(evt()), /actor/i);
  assert.equal(await bus.eventLog.size(), 0, 'unattributed fact never entered history');
});

test('authorization enforced: a policy denial rejects publication (KMOS-0190 PDP)', async () => {
  const onlyEditor: Authorizer = {
    authorize: (e) => ({ allowed: e.identity.actorId === EDITOR, reason: 'actor not permitted' }),
  };
  const bus = new EventBus({ requireActor: true, authorizer: onlyEditor });
  await assert.rejects(() => bus.publish(evt({ actorId: INTRUDER })), /denied|authoriz/i);
  const ok = await bus.publish(evt({ actorId: EDITOR }));
  assert.equal(ok.event.identity.actorId, EDITOR, 'authorized actor recorded on the fact (attribution)');
});

test('tenancy enforced: a tenant-scoped policy rejects cross-organization writes (HIGH-2)', async () => {
  const sameTenantOnly = (allowedOrg: string): Authorizer => ({
    authorize: (e) => ({
      allowed: e.identity.organizationId === allowedOrg,
      reason: 'cross-tenant write',
    }),
  });
  const busA = new EventBus({ requireActor: true, authorizer: sameTenantOnly(ORG_A) });
  await assert.rejects(() => busA.publish(evt({ actorId: EDITOR, organizationId: ORG_B })), /denied|tenant|authoriz/i);
  const ok = await busA.publish(evt({ actorId: EDITOR, organizationId: ORG_A }));
  assert.equal(ok.event.identity.organizationId, ORG_A);
});

test('non-enforcing default is backward compatible (no actor required)', async () => {
  const bus = new EventBus(); // defaults: requireActor=false, ALLOW_ALL
  const stored = await bus.publish(evt());
  assert.equal(await bus.eventLog.size(), 1);
  assert.equal(stored.event.identity.actorId, undefined);
});

test('audit attribution: correlated facts all carry the acting identity', async () => {
  const bus = new EventBus({ requireActor: true });
  const root = evt({ actorId: EDITOR, organizationId: ORG_A });
  await bus.publish(root);
  const caused = createEvent({
    type: 'KnowledgeUpdated', schemaVersion: '1.0', producer: 'KnowledgeService',
    payload: {}, actorId: EDITOR, organizationId: ORG_A, causedBy: root,
  });
  await bus.publish(caused);
  for (const s of await bus.eventLog.read(1)) {
    assert.equal(s.event.identity.actorId, EDITOR, 'every fact is attributable to an authenticated actor');
  }
});
