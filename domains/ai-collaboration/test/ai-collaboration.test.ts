import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, type StoredEvent } from '@kmos/canonical-kernel';
import { IdentityService } from '@kmos/identity';
import { GovernanceService } from '@kmos/governance';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { AiCollaborationService } from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

function wire() {
  // One shared bus so every service's facts land on the same append-only log.
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const identity = new IdentityService({ bus, now: fixedNow });
  const governance = new GovernanceService({ bus, now: fixedNow });
  const registry = new CapabilityRegistryService({ bus, now: fixedNow });
  const runtime = new CapabilityRuntimeService({ bus, now: fixedNow });
  const ai = new AiCollaborationService({ bus, identity, governance, registry, runtime, now: fixedNow });
  return { bus, identity, governance, registry, runtime, ai };
}

/** A trivial AI worker: echoes a recommendation with a confidence. */
const summarizerWorker = async (input: Record<string, unknown>) => ({
  output: { summary: `summary of: ${String(input['text'] ?? '')}` },
  confidence: 0.82,
});

async function types(bus: EventBus): Promise<Set<string>> {
  return new Set((await bus.eventLog.read()).map((s: StoredEvent) => s.event.identity.type));
}

test('registering an AI worker creates a canonical AiWorker identity AND a capability', async () => {
  const { ai, identity, registry, bus } = wire();
  const reg = await ai.registerAiWorker({
    name: 'Summarizer', ownerDomain: 'Knowledge', modelVersion: 'gpt-x-1', handler: summarizerWorker,
  });

  // Canonical identity exists and is of kind 'AiWorker' (AI never anonymous).
  const id = identity.getIdentity(reg.aiWorkerIdentityId);
  assert.ok(id, 'AI worker identity should exist');
  assert.equal(id?.body.kind, 'AiWorker');
  assert.equal(id?.body.active, true);
  assert.ok(reg.aiWorkerIdentityId.startsWith('kmos:Identity:'));

  // Capability registered for the worker.
  const cap = registry.getCapability(reg.capabilityId);
  assert.ok(cap, 'capability should be registered');
  assert.equal(cap?.body.name, 'Summarizer');
  assert.ok(reg.capabilityId.startsWith('kmos:Capability:'));

  // Identity + capability facts landed on the shared bus.
  const t = await types(bus);
  assert.ok(t.has('IdentityCreated'));
  assert.ok(t.has('CapabilityRegistered'));
  assert.ok(t.has('CapabilityRuntimeRegistered')); // runtime implementation registered
});

test('invoking the worker runs it via the runtime and records a Pending, non-authoritative contribution + emits AiContributionRecorded', async () => {
  const { ai, bus } = wire();
  const reg = await ai.registerAiWorker({
    name: 'Summarizer', ownerDomain: 'Knowledge', modelVersion: 'gpt-x-1', handler: summarizerWorker,
  });

  const contribution = await ai.invokeAiWorker({ capabilityId: reg.capabilityId, input: { text: 'hello world' } });

  // The contribution captures the required AI provenance (KMOS-0008 §9).
  assert.equal(contribution.body.capabilityId, reg.capabilityId);
  assert.equal(contribution.body.aiWorkerIdentityId, reg.aiWorkerIdentityId);
  assert.equal(contribution.body.modelVersion, 'gpt-x-1');
  assert.equal(contribution.body.confidence, 0.82);
  assert.match(contribution.body.outputSummary, /summary of: hello world/);

  // AI output is a RECOMMENDATION: Pending review, NOT authoritative.
  assert.equal(contribution.body.humanReviewStatus, 'Pending');
  assert.equal(contribution.body.authoritative, false);
  assert.equal(contribution.owner, 'GovernanceService');

  // The runtime actually executed the capability, and the contribution was emitted.
  const t = await types(bus);
  assert.ok(t.has('CapabilityExecutionCompleted'));
  assert.ok(t.has('AiContributionRecorded'));
});

test('a contribution is NOT authoritative until a human review approves it; approval routes through Governance', async () => {
  const { ai, governance, bus } = wire();
  const reg = await ai.registerAiWorker({
    name: 'Summarizer', ownerDomain: 'Knowledge', modelVersion: 'gpt-x-1', handler: summarizerWorker,
  });
  const contribution = await ai.invokeAiWorker({ capabilityId: reg.capabilityId, input: { text: 'review me' } });
  assert.equal(contribution.body.authoritative, false);

  const reviewed = await ai.submitHumanReview({
    contributionId: contribution.id, reviewer: 'editor@kmos', verdict: 'Approved', reason: 'Looks correct',
  });

  // Only a human-approved contribution is authoritative.
  assert.equal(reviewed.body.humanReviewStatus, 'Approved');
  assert.equal(reviewed.body.authoritative, true);
  assert.equal(reviewed.body.reviewer, 'editor@kmos');
  assert.ok(reviewed.body.approvalId, 'an approval should be linked');

  // The stored contribution reflects the approval too.
  assert.equal(ai.getContribution(contribution.id)?.body.authoritative, true);

  // Governance RECORDED the human decision (system of record for the decision).
  const decisions = governance.getDecisions(contribution.id);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]?.body.decisionType, 'Approval');
  assert.equal(decisions[0]?.body.outcome, 'Granted');
  assert.equal(decisions[0]?.body.authority, 'editor@kmos');

  // ApprovalGranted landed on the shared bus.
  assert.ok((await types(bus)).has('ApprovalGranted'));
});

test('human rejection marks the contribution Rejected and keeps it non-authoritative; governance records the rejection', async () => {
  const { ai, governance, bus } = wire();
  const reg = await ai.registerAiWorker({
    name: 'Summarizer', ownerDomain: 'Knowledge', modelVersion: 'gpt-x-1', handler: summarizerWorker,
  });
  const contribution = await ai.invokeAiWorker({ capabilityId: reg.capabilityId, input: { text: 'bad output' } });

  const reviewed = await ai.submitHumanReview({
    contributionId: contribution.id, reviewer: 'editor@kmos', verdict: 'Rejected', reason: 'Hallucinated',
  });

  assert.equal(reviewed.body.humanReviewStatus, 'Rejected');
  assert.equal(reviewed.body.authoritative, false);

  const decisions = governance.getDecisions(contribution.id);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0]?.body.outcome, 'Rejected');
  assert.ok((await types(bus)).has('ApprovalRejected'));
});

test('the AI worker has a canonical identity and never operates anonymously: contributions are attributed to it', async () => {
  const { ai, identity } = wire();
  const reg = await ai.registerAiWorker({
    name: 'Researcher', ownerDomain: 'Knowledge', modelVersion: 'claude-x', handler: summarizerWorker,
  });
  const contribution = await ai.invokeAiWorker({ capabilityId: reg.capabilityId, input: { text: 'who am i' } });

  // Every contribution carries the worker's canonical identity id.
  assert.equal(contribution.body.aiWorkerIdentityId, reg.aiWorkerIdentityId);
  const id = identity.getIdentity(contribution.body.aiWorkerIdentityId);
  assert.ok(id, 'the attributed identity must resolve to a canonical identity');
  assert.equal(id?.body.kind, 'AiWorker');

  // listContributions returns the recorded ledger.
  assert.equal(ai.listContributions().length, 1);
});

test('a contribution cannot be reviewed twice', async () => {
  const { ai } = wire();
  const reg = await ai.registerAiWorker({
    name: 'Summarizer', ownerDomain: 'Knowledge', modelVersion: 'gpt-x-1', handler: summarizerWorker,
  });
  const contribution = await ai.invokeAiWorker({ capabilityId: reg.capabilityId, input: { text: 'x' } });
  await ai.submitHumanReview({ contributionId: contribution.id, reviewer: 'editor@kmos', verdict: 'Approved' });
  await assert.rejects(
    () => ai.submitHumanReview({ contributionId: contribution.id, reviewer: 'editor@kmos', verdict: 'Rejected' }),
    /already reviewed/,
  );
});
