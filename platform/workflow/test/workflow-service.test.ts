import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '@kmos/canonical-kernel';
import {
  WorkflowService,
  ManualTimerScheduler,
  createWorkflowCatalog,
  type CapabilityInvoker,
  type InvocationContext,
  type WorkflowStep,
} from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** A fake invoker that records every call and returns scripted outputs. */
class FakeInvoker implements CapabilityInvoker {
  readonly calls: { ref: string; input: Record<string, unknown>; context: InvocationContext }[] = [];
  private readonly outputs: Record<string, unknown>;
  private readonly failOn?: string;
  constructor(outputs: Record<string, unknown> = {}, failOn?: string) {
    this.outputs = outputs;
    this.failOn = failOn;
  }
  async invoke(ref: string, input: Record<string, unknown>, context: InvocationContext): Promise<unknown> {
    this.calls.push({ ref, input, context });
    if (this.failOn && ref === this.failOn) throw new Error(`capability failed: ${ref}`);
    return this.outputs[ref] ?? { ok: true, ref };
  }
}

test('sequential 2-activity workflow completes; invoker called with mapped inputs (KMOS-0204 §12)', async () => {
  const invoker = new FakeInvoker({
    'cap:transcribe': { transcript: 'hello world' },
    'cap:extract': { concepts: ['a', 'b'] },
  });
  const svc = new WorkflowService({ invoker, now: fixedNow });

  const steps: WorkflowStep[] = [
    { id: 'transcribe', kind: 'activity', capabilityRef: 'cap:transcribe', input: { audio: '$input.audioRef' } },
    { id: 'extract', kind: 'activity', capabilityRef: 'cap:extract', input: { text: '$steps.transcribe.transcript' } },
  ];
  const def = await svc.registerWorkflow({ name: 'lecture', ownerDomain: 'media', businessPurpose: 'process', steps });
  const exec = await svc.start(def.id, { audioRef: 'kmos:Asset:abc' });

  assert.equal(exec.body.state, 'Completed');
  assert.equal(invoker.calls.length, 2);
  // First activity received the execution input mapped to "audio".
  assert.deepEqual(invoker.calls[0]!.input, { audio: 'kmos:Asset:abc' });
  // Second activity received the prior step's output mapped to "text".
  assert.deepEqual(invoker.calls[1]!.input, { text: 'hello world' });
  // Step results recorded.
  assert.deepEqual(exec.body.stepResults['transcribe']!.output, { transcript: 'hello world' });
});

test('registered workflows are versioned and immutable (KMOS-0150 §18)', async () => {
  const svc = new WorkflowService({ invoker: new FakeInvoker(), now: fixedNow });
  const a = await svc.registerWorkflow({ name: 'wf', ownerDomain: 'd', businessPurpose: 'p', steps: [] });
  const b = await svc.registerWorkflow({ name: 'wf', ownerDomain: 'd', businessPurpose: 'p', steps: [] });
  assert.equal(a.body.version, 1);
  assert.equal(b.body.version, 2);
  assert.notEqual(a.id, b.id);
  // WorkflowRegistered published on a local catalog (seeded type).
  const registered = (await svc.eventBus.eventLog.read(1)).filter((s) => s.event.identity.type === 'WorkflowRegistered');
  assert.equal(registered.length, 2);
});

test('parallel branches both run then synchronize (KMOS-0150 §10)', async () => {
  const invoker = new FakeInvoker({ 'cap:x': { v: 1 }, 'cap:y': { v: 2 }, 'cap:after': { done: true } });
  const svc = new WorkflowService({ invoker, now: fixedNow });
  const steps: WorkflowStep[] = [
    {
      id: 'fork', kind: 'parallel', branches: [
        [{ id: 'bx', kind: 'activity', capabilityRef: 'cap:x' }],
        [{ id: 'by', kind: 'activity', capabilityRef: 'cap:y' }],
      ],
    },
    { id: 'after', kind: 'activity', capabilityRef: 'cap:after' },
  ];
  const def = await svc.registerWorkflow({ name: 'par', ownerDomain: 'd', businessPurpose: 'p', steps });
  const exec = await svc.start(def.id);

  assert.equal(exec.body.state, 'Completed');
  const refs = invoker.calls.map((c) => c.ref).sort();
  assert.deepEqual(refs, ['cap:after', 'cap:x', 'cap:y']);
  // Both branch results plus the synchronized parallel result are recorded.
  assert.ok(exec.body.stepResults['bx']);
  assert.ok(exec.body.stepResults['by']);
  assert.ok(exec.body.stepResults['fork']);
});

test('human task pauses (Waiting) then completes and resumes to Completed (KMOS-0204 §14)', async () => {
  const invoker = new FakeInvoker({ 'cap:publish': { url: 'x' } });
  const svc = new WorkflowService({ invoker, now: fixedNow });
  const steps: WorkflowStep[] = [
    { id: 'review', kind: 'humanTask', role: 'editor', description: 'review transcript' },
    { id: 'publish', kind: 'activity', capabilityRef: 'cap:publish' },
  ];
  const def = await svc.registerWorkflow({ name: 'review', ownerDomain: 'd', businessPurpose: 'p', steps });
  let exec = await svc.start(def.id);

  assert.equal(exec.body.state, 'Waiting');
  assert.equal(invoker.calls.length, 0, 'no work before human task resolved');
  const tasks = svc.getHumanTasks(exec.id);
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]!.body.status, 'Open');

  exec = await svc.completeHumanTask(tasks[0]!.id, { approved: true });
  assert.equal(exec.body.state, 'Completed');
  assert.equal(invoker.calls.length, 1);
  assert.equal(svc.getHumanTasks(exec.id)[0]!.body.status, 'Completed');
});

test('approval task pauses then approval resumes execution (KMOS-0204 §17)', async () => {
  const invoker = new FakeInvoker({ 'cap:final': { ok: true } });
  const svc = new WorkflowService({ invoker, now: fixedNow });
  const steps: WorkflowStep[] = [
    { id: 'gate', kind: 'approvalTask', approver: 'legal' },
    { id: 'final', kind: 'activity', capabilityRef: 'cap:final' },
  ];
  const def = await svc.registerWorkflow({ name: 'appr', ownerDomain: 'd', businessPurpose: 'p', steps });
  let exec = await svc.start(def.id);
  assert.equal(exec.body.state, 'Waiting');
  const task = svc.getApprovalTasks(exec.id)[0]!;
  exec = await svc.completeApproval(task.id, 'Approved');
  assert.equal(exec.body.state, 'Completed');
  assert.equal(invoker.calls.length, 1);
});

test('failing activity triggers compensation of completed steps in REVERSE order then Compensated (KMOS-0204 §18)', async () => {
  const invoker = new FakeInvoker(
    { 'cap:s1': { a: 1 }, 'cap:s2': { b: 2 } },
    'cap:s3', // s3 fails
  );
  const svc = new WorkflowService({ invoker, now: fixedNow });
  const steps: WorkflowStep[] = [
    { id: 's1', kind: 'activity', capabilityRef: 'cap:s1', compensateWith: 'c1' },
    { id: 's2', kind: 'activity', capabilityRef: 'cap:s2', compensateWith: 'c2' },
    { id: 's3', kind: 'activity', capabilityRef: 'cap:s3' },
    { id: 'c1', kind: 'compensation', capabilityRef: 'cap:undo1' },
    { id: 'c2', kind: 'compensation', capabilityRef: 'cap:undo2' },
  ];
  const def = await svc.registerWorkflow({ name: 'saga', ownerDomain: 'd', businessPurpose: 'p', steps });
  const exec = await svc.start(def.id);

  assert.equal(exec.body.state, 'Compensated');
  const compRefs = invoker.calls.filter((c) => c.ref.startsWith('cap:undo')).map((c) => c.ref);
  // s1 then s2 completed; compensation runs in reverse: undo2 then undo1.
  assert.deepEqual(compRefs, ['cap:undo2', 'cap:undo1']);
  // CompensationStarted (seeded) published.
  const started = (await svc.eventBus.eventLog.read(1)).filter((s) => s.event.identity.type === 'CompensationStarted');
  assert.equal(started.length, 1);
});

test('deterministic replay reconstructs the same execution state (KMOS-0204 §23)', async () => {
  const invoker = new FakeInvoker({ 'cap:a': { a: 1 }, 'cap:b': { b: 2 } });
  const svc = new WorkflowService({ invoker, now: fixedNow });
  const steps: WorkflowStep[] = [
    { id: 'a', kind: 'activity', capabilityRef: 'cap:a' },
    { id: 'b', kind: 'activity', capabilityRef: 'cap:b' },
  ];
  const def = await svc.registerWorkflow({ name: 'rep', ownerDomain: 'd', businessPurpose: 'p', steps });
  const exec = await svc.start(def.id);

  const r1 = await svc.reconstructExecution(exec.id);
  const r2 = await svc.reconstructExecution(exec.id);
  assert.deepEqual(r1, r2, 'replay is deterministic');
  assert.equal(r1.state, 'Completed');
  assert.deepEqual(r1.completedSteps, ['a', 'b']);
  // Reconstructed step outputs match the live execution (rebuilt from events only).
  assert.deepEqual(r1.stepResults['a']!.output, exec.body.stepResults['a']!.output);
  assert.deepEqual(r1.stepResults['b']!.output, exec.body.stepResults['b']!.output);
});

test('cancel transitions a waiting execution to Cancelled (KMOS-0204 §8)', async () => {
  const invoker = new FakeInvoker();
  const svc = new WorkflowService({ invoker, now: fixedNow });
  const steps: WorkflowStep[] = [{ id: 'wait', kind: 'humanTask', role: 'editor' }];
  const def = await svc.registerWorkflow({ name: 'cancel', ownerDomain: 'd', businessPurpose: 'p', steps });
  let exec = await svc.start(def.id);
  assert.equal(exec.body.state, 'Waiting');
  exec = await svc.cancel(exec.id);
  assert.equal(exec.body.state, 'Cancelled');
  const cancelled = (await svc.eventBus.eventLog.read(1)).filter((s) => s.event.identity.type === 'WorkflowCancelled');
  assert.equal(cancelled.length, 1);
});

test('timer waits then fires manually to resume execution (KMOS-0204 §5; determinism)', async () => {
  const timers = new ManualTimerScheduler();
  const invoker = new FakeInvoker({ 'cap:next': { ok: true } });
  const svc = new WorkflowService({ invoker, timers, now: fixedNow });
  // Single trivial step workflow; we arm a timer against a running-ish execution.
  const steps: WorkflowStep[] = [{ id: 'hold', kind: 'humanTask', role: 'editor' }];
  const def = await svc.registerWorkflow({ name: 'timer', ownerDomain: 'd', businessPurpose: 'p', steps });
  const exec = await svc.start(def.id);
  // Arm a timer directly on the execution (it is already Waiting on the human task).
  const timer = await svc.armTimer(exec.id, 'hold');
  assert.equal(timers.isArmed(timer.id), true);
  await timers.fire(timer.id);
  assert.equal(timers.isArmed(timer.id), false);
  // Firing recorded a TimerExpired event.
  const expired = (await svc.eventBus.eventLog.read(1)).filter((s) => s.event.identity.type === 'TimerExpired');
  assert.equal(expired.length, 1);
});

test('no business logic in the engine: ALL work happens through the invoker', async () => {
  // Workflow with two activities; without an invoker the engine cannot compute.
  const svc = new WorkflowService({ now: fixedNow }); // NullInvoker
  const steps: WorkflowStep[] = [{ id: 'a', kind: 'activity', capabilityRef: 'cap:a' }];
  const def = await svc.registerWorkflow({ name: 'noinvoker', ownerDomain: 'd', businessPurpose: 'p', steps });
  const exec = await svc.start(def.id);
  // The engine produced NO result of its own; the activity could not run, so the
  // execution failed rather than computing anything itself.
  assert.equal(exec.body.state, 'Failed');
  assert.match(exec.body.error ?? '', /No CapabilityInvoker/);
});

test('read-model recovery: fresh service on the same durable log rebuilds executions, definitions, and tasks (ADR-0011)', async () => {
  // Shared durable-ish bus + a deterministic invoker so s1 and s2 agree.
  const bus = new EventBus({ catalog: createWorkflowCatalog() });
  const invoker = new FakeInvoker({
    'cap:transcribe': { transcript: 'hello world' },
    'cap:publish': { url: 'https://example/x' },
    'cap:s1': { a: 1 },
    'cap:s2': { b: 2 },
  });

  const s1 = new WorkflowService({ bus, invoker, now: fixedNow });

  // (a) A workflow that goes through Waiting via a human task, then completes.
  const reviewDef = await s1.registerWorkflow({
    name: 'review',
    ownerDomain: 'media',
    businessPurpose: 'review then publish',
    steps: [
      { id: 'review', kind: 'humanTask', role: 'editor', description: 'review transcript' },
      { id: 'publish', kind: 'activity', capabilityRef: 'cap:publish' },
    ],
  });
  let reviewExec = await s1.start(reviewDef.id, { audioRef: 'kmos:Asset:abc' });
  assert.equal(reviewExec.body.state, 'Waiting');
  const humanTask = s1.getHumanTasks(reviewExec.id)[0]!;
  reviewExec = await s1.completeHumanTask(humanTask.id, { approved: true });
  assert.equal(reviewExec.body.state, 'Completed');

  // (b) A saga that fails and compensates completed steps.
  const failingInvoker = new FakeInvoker({ 'cap:s1': { a: 1 }, 'cap:s2': { b: 2 } }, 'cap:s3');
  const s1b = new WorkflowService({ bus, invoker: failingInvoker, now: fixedNow });
  const sagaDef = await s1b.registerWorkflow({
    name: 'saga',
    ownerDomain: 'd',
    businessPurpose: 'p',
    steps: [
      { id: 's1', kind: 'activity', capabilityRef: 'cap:s1', compensateWith: 'c1' },
      { id: 's2', kind: 'activity', capabilityRef: 'cap:s2', compensateWith: 'c2' },
      { id: 's3', kind: 'activity', capabilityRef: 'cap:s3' },
      { id: 'c1', kind: 'compensation', capabilityRef: 'cap:undo1' },
      { id: 'c2', kind: 'compensation', capabilityRef: 'cap:undo2' },
    ],
  });
  const sagaExec = await s1b.start(sagaDef.id);
  assert.equal(sagaExec.body.state, 'Compensated');

  // FRESH service on the SAME bus + invoker: empty before hydrate.
  const s2 = new WorkflowService({ bus, invoker, now: fixedNow });
  assert.equal(s2.getExecution(reviewExec.id), undefined, 'no execution before hydrate');
  assert.equal(s2.getWorkflow(reviewDef.id), undefined, 'no definition before hydrate');
  assert.equal(s2.getHumanTasks(reviewExec.id).length, 0, 'no tasks before hydrate');

  await s2.hydrate();

  // Definitions rebuilt identically.
  assert.deepEqual(s2.getWorkflow(reviewDef.id), s1.getWorkflow(reviewDef.id));
  assert.deepEqual(s2.getWorkflow(sagaDef.id), s1b.getWorkflow(sagaDef.id));

  // Executions rebuilt to the SAME final head (state + stepResults + cursor).
  assert.deepEqual(s2.getExecution(reviewExec.id), s1.getExecution(reviewExec.id));
  assert.equal(s2.getExecution(reviewExec.id)!.body.state, 'Completed');
  assert.deepEqual(
    s2.getExecution(reviewExec.id)!.body.stepResults,
    reviewExec.body.stepResults,
  );

  assert.deepEqual(s2.getExecution(sagaExec.id), s1b.getExecution(sagaExec.id));
  assert.equal(s2.getExecution(sagaExec.id)!.body.state, 'Compensated');

  // Tasks rebuilt (Completed status carried through the log).
  assert.deepEqual(s2.getHumanTasks(reviewExec.id), s1.getHumanTasks(reviewExec.id));
  assert.equal(s2.getHumanTasks(reviewExec.id)[0]!.body.status, 'Completed');
  assert.deepEqual(s2.getApprovalTasks(reviewExec.id), s1.getApprovalTasks(reviewExec.id));
});

test('read-model recovery: approval task Waiting state rebuilds after restart', async () => {
  const bus = new EventBus({ catalog: createWorkflowCatalog() });
  const invoker = new FakeInvoker({ 'cap:final': { ok: true } });
  const s1 = new WorkflowService({ bus, invoker, now: fixedNow });
  const def = await s1.registerWorkflow({
    name: 'appr',
    ownerDomain: 'd',
    businessPurpose: 'p',
    steps: [
      { id: 'gate', kind: 'approvalTask', approver: 'legal' },
      { id: 'final', kind: 'activity', capabilityRef: 'cap:final' },
    ],
  });
  const exec = await s1.start(def.id);
  assert.equal(exec.body.state, 'Waiting');

  // Restart while the execution is still Waiting on the approval task.
  const s2 = new WorkflowService({ bus, invoker, now: fixedNow });
  await s2.hydrate();
  assert.deepEqual(s2.getExecution(exec.id), s1.getExecution(exec.id));
  assert.equal(s2.getExecution(exec.id)!.body.state, 'Waiting');
  assert.deepEqual(s2.getApprovalTasks(exec.id), s1.getApprovalTasks(exec.id));
  assert.equal(s2.getApprovalTasks(exec.id)[0]!.body.status, 'Open');
});

test('createWorkflowCatalog registers events the kernel seed omits', () => {
  const catalog = createWorkflowCatalog();
  for (const t of ['WorkflowFailed', 'StepCompleted', 'ApprovalTaskCreated', 'TimerExpired', 'HumanTaskCompleted', 'CompensationCompleted']) {
    assert.equal(catalog.has(t), true, `${t} should be registered`);
  }
  // Seeded types still present.
  assert.equal(catalog.has('WorkflowRegistered'), true);
  assert.equal(catalog.has('CompensationStarted'), true);
});
