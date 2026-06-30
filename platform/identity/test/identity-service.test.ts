import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, isKmosError, type StoredEvent } from '@kmos/canonical-kernel';
import { IdentityService } from '../src/index.js';

/** Deterministic clock that advances by 1s on each call (so versions/timestamps differ). */
function steppingClock(startIso = '2026-06-30T00:00:00.000Z', stepMs = 1000): () => string {
  let t = Date.parse(startIso);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

function typesOf(history: readonly StoredEvent[]): string[] {
  return history.map((s) => s.event.identity.type);
}

test('identity lifecycle: human, service account, and AI worker are all first-class (KMOS-0206 §5)', async () => {
  const svc = new IdentityService({ now: steppingClock() });
  const org = await svc.createOrganization('Acme Archive');

  const human = await svc.createIdentity({ kind: 'Human', displayName: 'Ada Editor', organizationId: org.id });
  assert.equal(human.body.kind, 'Human');
  assert.equal(human.owner, 'IdentityService');
  assert.equal(human.organizationId, org.id);
  assert.equal(human.body.active, true);

  const svcAcct = await svc.registerServiceAccount('publisher-bot', 'secret-1', 'ServiceAccount', org.id);
  assert.equal(svcAcct.body.kind, 'ServiceAccount');

  const aiWorker = await svc.createIdentity({ kind: 'AiWorker', displayName: 'transcription-ai' });
  assert.equal(aiWorker.body.kind, 'AiWorker');

  // Non-human identities emit ServiceAccountRegistered in addition to IdentityCreated.
  const types = typesOf(await svc.getEventHistory());
  assert.equal(types.filter((t) => t === 'IdentityCreated').length, 4); // org + human + svcAcct + aiWorker
  assert.equal(types.filter((t) => t === 'ServiceAccountRegistered').length, 2); // svcAcct + aiWorker

  // Non-human actors are never anonymous: empty display name is rejected.
  await assert.rejects(() => svc.createIdentity({ kind: 'Connector', displayName: '   ' }), /non-empty display name/);
});

test('organization is a first-class object and scopes identities', async () => {
  const svc = new IdentityService({ now: steppingClock() });
  const org = await svc.createOrganization('Newsroom');
  assert.equal(org.type, 'Organization');
  assert.equal(svc.getOrganization(org.id)?.body.name, 'Newsroom');

  // Creating an identity in an unknown org is rejected.
  await assert.rejects(
    () => svc.createIdentity({ kind: 'Human', displayName: 'X', organizationId: 'kmos:Organization:00000000-0000-4000-8000-000000000000' }),
    (e) => isKmosError(e) && e.category === 'NotFound',
  );
});

test('roles: assign and revoke (KMOS-0206 §7)', async () => {
  const svc = new IdentityService({ now: steppingClock() });
  const approve = svc.createPermission('knowledge.approve', 'Approve Knowledge');
  const editor = svc.createRole('Editor', [approve.id]);
  const ada = await svc.createIdentity({ kind: 'Human', displayName: 'Ada' });

  let updated = await svc.assignRole(ada.id, editor.id);
  assert.deepEqual(updated.body.roleIds, [editor.id]);
  assert.equal(updated.version, 2);
  // Idempotent re-assign does not duplicate.
  updated = await svc.assignRole(ada.id, editor.id);
  assert.equal(updated.body.roleIds.length, 1);

  updated = await svc.revokeRole(ada.id, editor.id);
  assert.deepEqual(updated.body.roleIds, []);

  assert.ok(typesOf(await svc.getEventHistory()).includes('RoleAssigned'));
});

test('permissions: grant and revoke directly (KMOS-0206 §7)', async () => {
  const svc = new IdentityService({ now: steppingClock() });
  const publish = svc.createPermission('assets.publish', 'Publish Assets');
  const bot = await svc.registerServiceAccount('publisher', 'pw', 'ServiceAccount');

  let updated = await svc.grantPermission(bot.id, publish.id);
  assert.deepEqual(updated.body.permissionIds, [publish.id]);
  assert.equal(svc.authorize({ identityId: bot.id, permission: 'assets.publish' }), true);

  updated = await svc.revokePermission(bot.id, publish.id);
  assert.deepEqual(updated.body.permissionIds, []);
  assert.equal(svc.authorize({ identityId: bot.id, permission: 'assets.publish' }), false);

  assert.ok(typesOf(await svc.getEventHistory()).includes('PermissionGranted'));
});

test('authorization: allow via role, deny otherwise, organization scoping (KMOS-0206 §8)', async () => {
  const svc = new IdentityService({ now: steppingClock() });
  const orgA = await svc.createOrganization('A');
  const orgB = await svc.createOrganization('B');
  const exec = svc.createPermission('workflow.execute', 'Execute Workflow');
  const publisher = svc.createRole('Publisher', [exec.id]);
  const user = await svc.createIdentity({ kind: 'Human', displayName: 'Pat', organizationId: orgA.id });
  await svc.assignRole(user.id, publisher.id);

  // Allowed (role grants the permission), within the right org.
  const decision = svc.decide({ identityId: user.id, permission: 'workflow.execute', organizationId: orgA.id });
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, 'direct-or-role');

  // Denied for an unrelated permission.
  assert.equal(svc.authorize({ identityId: user.id, permission: 'knowledge.approve' }), false);

  // Denied across an organization boundary.
  assert.equal(svc.authorize({ identityId: user.id, permission: 'workflow.execute', organizationId: orgB.id }), false);

  // Unknown identity is explicitly denied.
  assert.equal(svc.decide({ identityId: 'kmos:Identity:11111111-1111-4111-8111-111111111111', permission: 'x' }).reason, 'unknown-identity');
});

test('delegation: grants scoped authority, is auditable, and authorization honors it (KMOS-0206 §9)', async () => {
  const svc = new IdentityService({ now: steppingClock() });
  const approve = svc.createPermission('knowledge.approve', 'Approve Knowledge');
  const reviewer = svc.createRole('Reviewer', [approve.id]);

  const manager = await svc.createIdentity({ kind: 'Human', displayName: 'Manager' });
  const stand_in = await svc.createIdentity({ kind: 'Human', displayName: 'Stand-In' });
  await svc.assignRole(manager.id, reviewer.id);

  // Stand-in cannot approve on their own.
  assert.equal(svc.authorize({ identityId: stand_in.id, permission: 'knowledge.approve' }), false);

  // Manager delegates the approve scope for 1 hour.
  const delegation = await svc.delegate(manager.id, stand_in.id, ['knowledge.approve'], 60 * 60 * 1000, 'covering PTO');
  assert.equal(delegation.type, 'Delegation');
  assert.equal(delegation.body.reason, 'covering PTO');
  assert.ok(delegation.body.expiresAt > delegation.body.grantedAt);

  // Now the stand-in is authorized via the delegation.
  const decision = svc.decide({ identityId: stand_in.id, permission: 'knowledge.approve' });
  assert.equal(decision.allowed, true);
  assert.match(decision.reason, /^delegation:/);

  // No privilege escalation: delegation cannot convey a permission the delegator lacks.
  assert.equal(svc.authorize({ identityId: stand_in.id, permission: 'assets.publish' }), false);

  assert.ok(typesOf(await svc.getEventHistory()).includes('DelegationCreated'));
});

test('delegation expiry is honored', async () => {
  const clock = steppingClock('2026-06-30T00:00:00.000Z', 0); // frozen-ish; advance manually below
  let now = Date.parse('2026-06-30T00:00:00.000Z');
  const svc = new IdentityService({ now: () => new Date(now).toISOString() });
  const approve = svc.createPermission('knowledge.approve');
  const role = svc.createRole('Reviewer', [approve.id]);
  const manager = await svc.createIdentity({ kind: 'Human', displayName: 'Mgr' });
  const standIn = await svc.createIdentity({ kind: 'Human', displayName: 'Sub' });
  await svc.assignRole(manager.id, role.id);

  await svc.delegate(manager.id, standIn.id, ['*'], 1000, 'short window');
  assert.equal(svc.authorize({ identityId: standIn.id, permission: 'knowledge.approve' }), true);

  // Advance the clock past expiry.
  now += 2000;
  assert.equal(svc.authorize({ identityId: standIn.id, permission: 'knowledge.approve' }), false);
  assert.equal(svc.activeDelegationsFor(standIn.id).length, 0);
  void clock;
});

test('authentication: success issues a valid session and emits AuthenticationSucceeded (KMOS-0206 §10)', async () => {
  const svc = new IdentityService({ now: steppingClock() });
  const bot = await svc.registerServiceAccount('ingest-bot', 'top-secret', 'Automation');

  const session = await svc.authenticate(bot.id, 'top-secret');
  assert.equal(session.type, 'Session');
  assert.equal(session.body.identityId, bot.id);
  assert.equal(svc.validateSession(session.id), true);

  assert.ok(typesOf(await svc.getEventHistory()).includes('AuthenticationSucceeded'));
});

test('authentication: failure throws Authentication KmosError and emits AuthenticationFailed', async () => {
  const svc = new IdentityService({ now: steppingClock() });
  const bot = await svc.registerServiceAccount('ingest-bot', 'top-secret', 'Automation');

  await assert.rejects(
    () => svc.authenticate(bot.id, 'wrong'),
    (e) => isKmosError(e) && e.category === 'Authentication' && e.code === 'identity.authn.bad_credential',
  );
  // Unknown identity also fails as Authentication.
  await assert.rejects(
    () => svc.authenticate('kmos:Identity:22222222-2222-4222-8222-222222222222', 'x'),
    (e) => isKmosError(e) && e.category === 'Authentication',
  );

  assert.equal(typesOf(await svc.getEventHistory()).filter((t) => t === 'AuthenticationFailed').length, 2);
});

test('injected EventBus receives all canonical events (subscriber wiring)', async () => {
  const bus = new EventBus();
  const seen: string[] = [];
  bus.subscribe({ subscriber: 'audit', eventTypes: ['*'], handler: (s) => { seen.push(s.event.identity.type); } });
  const svc = new IdentityService({ bus, now: steppingClock() });

  await svc.createIdentity({ kind: 'Human', displayName: 'Z' });
  assert.deepEqual(seen, ['IdentityCreated']);
});
