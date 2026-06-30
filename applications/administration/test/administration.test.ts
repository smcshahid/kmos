import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '@kmos/canonical-kernel';
import { IdentityService } from '@kmos/identity';
import { GovernanceService } from '@kmos/governance';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { Administration } from '../src/index.js';

/** Deterministic clock that advances 1s per call so versions/timestamps differ. */
function steppingClock(startIso = '2026-06-30T00:00:00.000Z', stepMs = 1000): () => string {
  let t = Date.parse(startIso);
  return () => {
    const iso = new Date(t).toISOString();
    t += stepMs;
    return iso;
  };
}

const contract = {
  acceptedObjects: ['Asset'],
  producedObjects: ['Transcript'],
  consumedEvents: ['AssetRegistered'],
  publishedEvents: ['TranscriptGenerated'],
};

function wire() {
  // All three platform services share ONE bus whose merged catalog covers
  // identity, governance and capability events (single-shared-bus deployment).
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const now = steppingClock();
  const identity = new IdentityService({ bus, now });
  const governance = new GovernanceService({ bus, now });
  const capabilities = new CapabilityRegistryService({ bus, now });
  const admin = new Administration({ identity, governance, capabilities });
  return { bus, identity, governance, capabilities, admin };
}

test('Administration: identity admin provisions user + role + permission, Identity reflects assignment (thin delegation)', async () => {
  const { identity, admin } = wire();

  const org = await identity.createOrganization('Acme Archive');
  const user = await admin.createUser({ displayName: 'Ada Operator', organizationId: org.id });
  assert.equal(user.body.kind, 'Human', 'createUser provisions a Human identity');
  assert.equal(user.owner, 'IdentityService', 'identity object is owned by the platform service, not the app');

  const perm = admin.createPermission('catalog:certify');
  const role = admin.createRole('Curator', [perm.id]);

  const updated = await admin.assignRole(user.id, role.id);
  assert.ok(updated.body.roleIds.includes(role.id), 'returned identity carries the assigned role');

  // The Identity Service is the authority: read it back independently.
  assert.ok(
    identity.getIdentity(user.id)?.body.roleIds.includes(role.id),
    'Identity Service reflects the role assignment',
  );
  // The role-derived permission is honoured by the Identity Service's own authz.
  assert.equal(
    identity.authorize({ identityId: user.id, permission: 'catalog:certify' }),
    true,
    'Identity Service grants the role-derived permission',
  );
});

test('Administration: certify a registered capability, Capability Registry reflects certification (thin delegation)', async () => {
  const { capabilities, admin } = wire();

  const cap = await capabilities.registerCapability({
    name: 'SpeechRecognition',
    ownerDomain: 'Language',
    businessPurpose: 'Transcribe audio',
    version: '1.0.0',
    inputs: ['Asset'],
    outputs: ['Transcript'],
    contract,
  });

  const listed = admin.listCapabilities();
  assert.ok(listed.some((c) => c.id === cap.id), 'listCapabilities discovers the registered capability');

  const cert = await admin.certifyCapability(cap.id, '1.0.0', 'Production', 'governance');
  assert.equal(cert.body.level, 'Production');
  assert.equal(cert.owner, 'CapabilityRegistry', 'certification object is owned by the registry, not the app');

  // The registry is the authority: read certification state back independently.
  assert.equal(
    capabilities.getCapability(cap.id)?.body.certification,
    'Production',
    'Capability Registry reflects the certification level',
  );
  assert.equal(capabilities.getCertificationHistory(cap.id).length, 1, 'registry records the certification');
  assert.equal(
    admin.listCapabilities({ minCertification: 'Production' }).length,
    1,
    'certified capability is discoverable by minimum certification',
  );
});

test('Administration: request + decide a governance approval, Governance records the decision (thin delegation)', async () => {
  const { governance, capabilities, admin } = wire();

  // Use a real canonical subject (a capability) as the approval subject.
  const cap = await capabilities.registerCapability({
    name: 'Translate',
    ownerDomain: 'Language',
    businessPurpose: 'x',
    version: '1.0.0',
    contract,
  });

  const approval = await admin.requestApproval(cap.id, ['reviewer-1']);
  assert.equal(approval.body.state, 'Pending');

  const pendingBefore = admin.pendingApprovals();
  assert.equal(pendingBefore.length, 1, 'the new approval is awaiting a decision');
  assert.equal(pendingBefore[0]!.id, approval.id);

  const decided = await admin.decideApproval(approval.id, 'reviewer-1', 'Granted', 'meets policy');
  assert.equal(decided.body.state, 'Granted');

  // Governance is the authority: read the approval back independently.
  const fromService = governance.getApproval(approval.id);
  assert.equal(fromService?.body.state, 'Granted', 'Governance records the decision');
  assert.equal(fromService?.owner, 'GovernanceService', 'approval object is owned by Governance, not the app');
  assert.equal(fromService?.body.decisions.length, 1, 'the reviewer decision is recorded');
  assert.equal(fromService?.body.decisions[0]!.reviewer, 'reviewer-1');

  // Once decided, it is no longer pending.
  assert.equal(admin.pendingApprovals().length, 0, 'decided approval is no longer pending');
});

test('Administration owns no canonical facts: every canonical event is produced by a platform service, never the app', async () => {
  const { bus, identity, capabilities, admin } = wire();

  const org = await identity.createOrganization('Org');
  const user = await admin.createUser({ displayName: 'Op', organizationId: org.id });
  const perm = admin.createPermission('p');
  const role = admin.createRole('R', [perm.id]);
  await admin.assignRole(user.id, role.id);
  const cap = await capabilities.registerCapability({
    name: 'C', ownerDomain: 'D', businessPurpose: 'x', version: '1.0.0', contract,
  });
  await admin.certifyCapability(cap.id, '1.0.0', 'Verified', 'gov');
  const approval = await admin.requestApproval(cap.id, ['rv']);
  await admin.decideApproval(approval.id, 'rv', 'Granted', 'ok');

  const producers = new Set((await bus.eventLog.read()).map((s) => s.event.identity.producer));
  assert.ok(producers.size > 0, 'platform services produced canonical events');
  for (const p of producers) {
    assert.ok(
      p === 'IdentityService' || p === 'GovernanceService' || p === 'CapabilityRegistry',
      `event produced by a platform service, not the app (got ${p})`,
    );
  }
  assert.ok(!producers.has('Administration'), 'the application produced no canonical events of its own');
});
