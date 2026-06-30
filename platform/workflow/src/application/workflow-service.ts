/**
 * Workflow Service application layer (KMOS-0204, KMOS-0150).
 *
 * The institutional coordination engine. It owns Workflow Definitions and
 * Executions, runs the declarative steps, and coordinates Human/Approval tasks,
 * parallel branches, timers, and compensation. It COORDINATES, it NEVER
 * COMPUTES (KMOS-0204 §1, KMOS-9999 §10): every unit of business work is
 * delegated to a Capability through the CapabilityInvoker port. The engine core
 * is deterministic — no clocks, randomness, or IO live here; those arrive via
 * injected ports (`now`, the invoker, the timer scheduler).
 */

import {
  EventBus,
  createCanonicalObject,
  createEvent,
  newCanonicalId,
  replay,
  KmosError,
  type CanonicalId,
  type CanonicalEvent,
  type EventGovernance,
} from '@kmos/canonical-kernel';
import {
  canExecTransition,
  type ActivityStep,
  type ApprovalTaskObject,
  type ApprovalTaskStep,
  type CompensationAction,
  type CompensationPlanObject,
  type HumanTaskObject,
  type HumanTaskStep,
  type ParallelStep,
  type StepResult,
  type TimerObject,
  type WorkflowDefinitionBody,
  type WorkflowDefinitionObject,
  type WorkflowExecutionBody,
  type WorkflowExecutionObject,
  type WorkflowExecutionState,
  type WorkflowStep,
} from '../domain/model.js';
import { resolveInput } from '../domain/input-mapping.js';
import { executionProjection, type ExecutionState } from '../domain/execution-projection.js';
import { createWorkflowCatalog } from '../domain/event-catalog.js';
import { InMemoryRepository, type Repository } from '../infrastructure/in-memory-repository.js';
import { ManualTimerScheduler } from '../infrastructure/manual-timer-scheduler.js';
import type { CapabilityInvoker, InvocationContext, TimerScheduler } from './ports.js';

export interface RegisterWorkflowInput {
  readonly name: string;
  readonly ownerDomain: string;
  readonly businessPurpose: string;
  readonly steps: readonly WorkflowStep[];
}

export interface WorkflowServiceOptions {
  readonly bus?: EventBus;
  readonly invoker?: CapabilityInvoker;
  readonly timers?: TimerScheduler;
  readonly now?: () => string;
}

/** Invoker used when none is injected: the engine performs NO work itself. */
class NullInvoker implements CapabilityInvoker {
  async invoke(ref: CanonicalId | string): Promise<unknown> {
    throw new KmosError(`No CapabilityInvoker configured to run '${ref}'`, {
      category: 'Infrastructure',
      code: 'workflow.invoker.missing',
    });
  }
}

export class WorkflowService {
  private readonly bus: EventBus;
  private readonly invoker: CapabilityInvoker;
  private readonly timers: TimerScheduler;
  private readonly now: () => string;

  private readonly definitions: Repository<WorkflowDefinitionObject> = new InMemoryRepository();
  private readonly executions: Repository<WorkflowExecutionObject> = new InMemoryRepository();
  private readonly humanTasks: Repository<HumanTaskObject> = new InMemoryRepository();
  private readonly approvalTasks: Repository<ApprovalTaskObject> = new InMemoryRepository();
  private readonly timerObjects: Repository<TimerObject> = new InMemoryRepository();
  private readonly compensationPlans: Repository<CompensationPlanObject> = new InMemoryRepository();

  constructor(options: WorkflowServiceOptions = {}) {
    // Construct the bus with the LOCAL workflow catalog so events the kernel
    // seed omits (WorkflowFailed, StepCompleted, ...) validate and publish.
    this.bus = options.bus ?? new EventBus({ catalog: createWorkflowCatalog() });
    this.invoker = options.invoker ?? new NullInvoker();
    this.timers = options.timers ?? new ManualTimerScheduler();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Underlying bus (for inter-service wiring / inspection within the monolith). */
  get eventBus(): EventBus {
    return this.bus;
  }

  // --- Workflow Registry (KMOS-0204 §11, KMOS-0150 §18) ---

  /** Register a workflow as a versioned, immutable definition. */
  async registerWorkflow(input: RegisterWorkflowInput): Promise<WorkflowDefinitionObject> {
    const existing = this.definitions
      .list()
      .filter((d) => d.body.name === input.name && d.body.ownerDomain === input.ownerDomain);
    const version = existing.length + 1;
    const id = newCanonicalId('WorkflowDefinition');
    const now = this.now();
    const def = createCanonicalObject<WorkflowDefinitionBody>({
      id,
      type: 'WorkflowDefinition',
      schemaVersion: '1.0',
      owner: 'WorkflowService',
      lifecycle: 'Active',
      displayName: `${input.name}@v${version}`,
      now,
      body: {
        name: input.name,
        ownerDomain: input.ownerDomain,
        businessPurpose: input.businessPurpose,
        version,
        steps: input.steps,
      },
    });
    this.definitions.put(def);
    await this.publish('WorkflowRegistered', id, { workflowId: id, name: input.name, version });
    return def;
  }

  getWorkflow(id: CanonicalId): WorkflowDefinitionObject | undefined {
    return this.definitions.get(id);
  }

  // --- Execution engine (KMOS-0204 §12) ---

  /** Start an execution and run it until completion or a wait/terminal state. */
  async start(workflowId: CanonicalId, input: Record<string, unknown> = {}): Promise<WorkflowExecutionObject> {
    const def = this.requireDefinition(workflowId);
    const id = newCanonicalId('WorkflowExecution');
    const now = this.now();
    let exec = createCanonicalObject<WorkflowExecutionBody>({
      id,
      type: 'WorkflowExecution',
      schemaVersion: '1.0',
      owner: 'WorkflowService',
      lifecycle: 'Active',
      now,
      body: {
        workflowId,
        definitionVersion: def.body.version,
        state: 'Created',
        input,
        stepResults: {},
        completedSteps: [],
        cursor: 0,
      },
    });
    this.executions.put(exec);
    exec = this.transition(exec, 'Running');
    await this.publish('WorkflowStarted', id, { workflowId, executionId: id });
    return this.drive(exec);
  }

  getExecution(id: CanonicalId): WorkflowExecutionObject | undefined {
    return this.executions.get(id);
  }

  getExecutionHistory(id: CanonicalId): readonly CanonicalEvent[] {
    return this.bus.eventLog.readStream(id).map((s) => s.event);
  }

  /**
   * Drive the execution forward from its cursor, running top-level steps until
   * the workflow completes, must wait (human/approval/timer), or fails. The
   * engine delegates every activity to the invoker; it never computes results.
   */
  private async drive(start: WorkflowExecutionObject): Promise<WorkflowExecutionObject> {
    let exec = start;
    const steps = this.requireDefinition(exec.body.workflowId).body.steps;
    while (exec.body.cursor < steps.length && exec.body.state === 'Running') {
      const step = steps[exec.body.cursor]!;
      try {
        const result = await this.runStep(exec, step);
        if (result === 'wait') return this.requireExecution(exec.id);
        exec = this.requireExecution(exec.id);
        exec = this.advanceCursor(exec);
      } catch (err) {
        return this.fail(exec, err);
      }
    }
    if (exec.body.cursor >= steps.length && exec.body.state === 'Running') {
      exec = this.transition(exec, 'Completed');
      await this.publish('WorkflowCompleted', exec.id, {
        workflowId: exec.body.workflowId,
        executionId: exec.id,
      });
    }
    return this.requireExecution(exec.id);
  }

  /**
   * Run one step. Returns 'wait' when the execution must pause for an external
   * signal (human task, approval, timer); 'done' when the step completed.
   */
  private async runStep(exec: WorkflowExecutionObject, step: WorkflowStep): Promise<'done' | 'wait'> {
    switch (step.kind) {
      case 'activity':
        await this.runActivity(exec, step);
        return 'done';
      case 'parallel':
        await this.runParallel(exec, step);
        return 'done';
      case 'humanTask':
        await this.openHumanTask(exec, step);
        return 'wait';
      case 'approvalTask':
        await this.openApprovalTask(exec, step);
        return 'wait';
      case 'compensation':
        // Compensation steps are not run forward; they are bound to forward
        // steps and invoked only during saga rollback.
        return 'done';
    }
  }

  private async runActivity(exec: WorkflowExecutionObject, step: ActivityStep): Promise<void> {
    const output = await this.invoke(exec, step.id, step.capabilityRef, step.input);
    await this.recordStep(exec.id, { stepId: step.id, kind: 'activity', output });
  }

  private async runParallel(exec: WorkflowExecutionObject, step: ParallelStep): Promise<void> {
    // Run each branch concurrently; synchronize before continuing (KMOS-0150 §10).
    const branchOutputs = await Promise.all(
      step.branches.map(async (branch, branchIndex) => {
        const outputs: Record<string, unknown> = {};
        for (const inner of branch) {
          if (inner.kind === 'activity') {
            const out = await this.invoke(
              this.requireExecution(exec.id),
              inner.id,
              inner.capabilityRef,
              inner.input,
            );
            outputs[inner.id] = out;
            await this.recordStep(exec.id, { stepId: inner.id, kind: 'activity', output: out });
          } else {
            throw new KmosError(`Parallel branches support activity steps only (branch ${branchIndex})`, {
              category: 'Validation',
              code: 'workflow.parallel.unsupported_step',
              subject: exec.id,
            });
          }
        }
        return outputs;
      }),
    );
    // Synchronization point: record the joined parallel result.
    await this.recordStep(exec.id, { stepId: step.id, kind: 'parallel', output: branchOutputs });
  }

  // --- Human & approval tasks (KMOS-0204 §14/§17) ---

  private async openHumanTask(exec: WorkflowExecutionObject, step: HumanTaskStep): Promise<void> {
    const id = newCanonicalId('HumanTask');
    const task = createCanonicalObject<HumanTaskObject['body']>({
      id,
      type: 'HumanTask',
      schemaVersion: '1.0',
      owner: 'WorkflowService',
      lifecycle: 'Active',
      now: this.now(),
      body: {
        executionId: exec.id,
        stepId: step.id,
        role: step.role,
        ...(step.description !== undefined ? { description: step.description } : {}),
        status: 'Open',
      },
    });
    this.humanTasks.put(task);
    this.executions.put(this.transition(exec, 'Waiting', { waitingFor: id }));
    await this.publish('HumanTaskCreated', exec.id, {
      executionId: exec.id,
      taskId: id,
      stepId: step.id,
      role: step.role,
    });
  }

  /** Complete a human task and resume the execution (KMOS-0204 §8). */
  async completeHumanTask(taskId: CanonicalId, result: unknown): Promise<WorkflowExecutionObject> {
    const task = this.humanTasks.get(taskId);
    if (!task) throw new KmosError(`No such human task: ${taskId}`, { category: 'NotFound', code: 'workflow.humantask.notfound', subject: taskId });
    if (task.body.status === 'Completed') {
      throw new KmosError(`Human task already completed: ${taskId}`, { category: 'Conflict', code: 'workflow.humantask.completed', subject: taskId });
    }
    this.humanTasks.put({ ...task, version: task.version + 1, updatedAt: this.now(), body: { ...task.body, status: 'Completed', result } });
    let exec = this.requireExecution(task.body.executionId);
    exec = this.transition(exec, 'Running', { clearWaiting: true });
    await this.recordStep(exec.id, { stepId: task.body.stepId, kind: 'humanTask', output: result }, 'HumanTaskCompleted', { taskId, result });
    return this.resume(this.advanceCursor(this.requireExecution(exec.id)));
  }

  private async openApprovalTask(exec: WorkflowExecutionObject, step: ApprovalTaskStep): Promise<void> {
    const id = newCanonicalId('ApprovalTask');
    const task = createCanonicalObject<ApprovalTaskObject['body']>({
      id,
      type: 'ApprovalTask',
      schemaVersion: '1.0',
      owner: 'WorkflowService',
      lifecycle: 'Active',
      now: this.now(),
      body: {
        executionId: exec.id,
        stepId: step.id,
        approver: step.approver,
        ...(step.description !== undefined ? { description: step.description } : {}),
        status: 'Open',
      },
    });
    this.approvalTasks.put(task);
    this.executions.put(this.transition(exec, 'Waiting', { waitingFor: id }));
    await this.publish('ApprovalTaskCreated', exec.id, {
      executionId: exec.id,
      taskId: id,
      stepId: step.id,
      approver: step.approver,
    });
  }

  /** Record an approval verdict and resume (Approved) or fail (Rejected). */
  async completeApproval(taskId: CanonicalId, verdict: 'Approved' | 'Rejected'): Promise<WorkflowExecutionObject> {
    const task = this.approvalTasks.get(taskId);
    if (!task) throw new KmosError(`No such approval task: ${taskId}`, { category: 'NotFound', code: 'workflow.approval.notfound', subject: taskId });
    if (task.body.status === 'Completed') {
      throw new KmosError(`Approval already completed: ${taskId}`, { category: 'Conflict', code: 'workflow.approval.completed', subject: taskId });
    }
    this.approvalTasks.put({ ...task, version: task.version + 1, updatedAt: this.now(), body: { ...task.body, status: 'Completed', verdict } });
    let exec = this.requireExecution(task.body.executionId);
    exec = this.transition(exec, 'Running', { clearWaiting: true });
    await this.recordStep(exec.id, { stepId: task.body.stepId, kind: 'approvalTask', output: verdict }, 'ApprovalTaskCompleted', { taskId, verdict });
    if (verdict === 'Rejected') {
      return this.compensate(this.requireExecution(exec.id), `Approval rejected: ${taskId}`);
    }
    return this.resume(this.advanceCursor(this.requireExecution(exec.id)));
  }

  getHumanTasks(executionId: CanonicalId): readonly HumanTaskObject[] {
    return this.humanTasks.list().filter((t) => t.body.executionId === executionId);
  }

  getApprovalTasks(executionId: CanonicalId): readonly ApprovalTaskObject[] {
    return this.approvalTasks.list().filter((t) => t.body.executionId === executionId);
  }

  // --- Timers (KMOS-0204 §5) ---

  /** Arm a timer step for an execution; the execution waits until it fires. */
  async armTimer(executionId: CanonicalId, stepId: string): Promise<TimerObject> {
    const exec = this.requireExecution(executionId);
    const id = newCanonicalId('WorkflowTimer');
    const timer = createCanonicalObject<TimerObject['body']>({
      id,
      type: 'WorkflowTimer',
      schemaVersion: '1.0',
      owner: 'WorkflowService',
      lifecycle: 'Active',
      now: this.now(),
      body: { executionId, stepId, status: 'Armed' },
    });
    this.timerObjects.put(timer);
    this.executions.put(this.transition(exec, 'Waiting', { waitingFor: id }));
    this.timers.arm(id, async () => {
      await this.onTimerExpired(id);
    });
    return timer;
  }

  private async onTimerExpired(timerId: CanonicalId): Promise<void> {
    const timer = this.timerObjects.get(timerId);
    if (!timer || timer.body.status !== 'Armed') return;
    this.timerObjects.put({ ...timer, version: timer.version + 1, updatedAt: this.now(), body: { ...timer.body, status: 'Expired' } });
    let exec = this.requireExecution(timer.body.executionId);
    exec = this.transition(exec, 'Running', { clearWaiting: true });
    await this.recordStep(exec.id, { stepId: timer.body.stepId, kind: 'activity', output: { timerExpired: true } }, 'TimerExpired', { timerId, stepId: timer.body.stepId });
    await this.resume(this.advanceCursor(this.requireExecution(exec.id)));
  }

  // --- Lifecycle controls (KMOS-0204 §8) ---

  async cancel(executionId: CanonicalId): Promise<WorkflowExecutionObject> {
    let exec = this.requireExecution(executionId);
    if (exec.body.state === 'Completed' || exec.body.state === 'Cancelled' || exec.body.state === 'Compensated') {
      throw new KmosError(`Execution not cancellable in state ${exec.body.state}`, { category: 'Conflict', code: 'workflow.cancel.invalid_state', subject: executionId });
    }
    exec = this.transition(exec, 'Cancelled', { clearWaiting: true });
    await this.publish('WorkflowCancelled', executionId, { executionId, workflowId: exec.body.workflowId });
    return exec;
  }

  async pause(executionId: CanonicalId): Promise<WorkflowExecutionObject> {
    let exec = this.requireExecution(executionId);
    exec = this.transition(exec, 'Paused');
    await this.publish('WorkflowPaused', executionId, { executionId });
    return exec;
  }

  async resumePaused(executionId: CanonicalId): Promise<WorkflowExecutionObject> {
    let exec = this.requireExecution(executionId);
    exec = this.transition(exec, 'Running');
    await this.publish('WorkflowResumed', executionId, { executionId });
    return this.resume(exec);
  }

  // --- Compensation / saga (KMOS-0204 §18) ---

  /**
   * Invoke compensation actions for already-completed steps in REVERSE order,
   * each delegated to the invoker, then mark the execution Compensated.
   */
  private async compensate(exec: WorkflowExecutionObject, reason: string): Promise<WorkflowExecutionObject> {
    const steps = this.requireDefinition(exec.body.workflowId).body.steps;
    const byId = new Map(steps.map((s) => [s.id, s] as const));
    const actions: CompensationAction[] = [];
    for (const completedId of [...exec.body.completedSteps].reverse()) {
      const fwd = byId.get(completedId);
      if (fwd?.kind === 'activity' && fwd.compensateWith) {
        const comp = byId.get(fwd.compensateWith);
        if (comp?.kind === 'compensation') {
          actions.push({ forStepId: completedId, capabilityRef: comp.capabilityRef, ...(comp.input ? { input: comp.input } : {}) });
        }
      }
    }
    const planId = newCanonicalId('CompensationPlan');
    this.compensationPlans.put(
      createCanonicalObject<CompensationPlanObject['body']>({
        id: planId,
        type: 'CompensationPlan',
        schemaVersion: '1.0',
        owner: 'WorkflowService',
        lifecycle: 'Active',
        now: this.now(),
        body: { executionId: exec.id, actions },
      }),
    );
    await this.publish('CompensationStarted', exec.id, { executionId: exec.id, planId, reason, actionCount: actions.length });
    for (const action of actions) {
      await this.invoke(this.requireExecution(exec.id), `compensate:${action.forStepId}`, action.capabilityRef, action.input);
    }
    let updated = this.transition(this.requireExecution(exec.id), 'Compensated', { clearWaiting: true });
    await this.publish('CompensationCompleted', exec.id, { executionId: exec.id, planId });
    await this.publish('WorkflowCompensated', exec.id, { executionId: exec.id });
    return updated;
  }

  private async fail(exec: WorkflowExecutionObject, err: unknown): Promise<WorkflowExecutionObject> {
    const message = err instanceof Error ? err.message : String(err);
    const failed = this.transition(this.requireExecution(exec.id), 'Failed', { error: message });
    await this.publish('WorkflowFailed', failed.id, { executionId: failed.id, workflowId: failed.body.workflowId, error: message });
    // Saga: if any completed step has a compensation, roll back in reverse order.
    if (failed.body.completedSteps.length > 0 && this.hasCompensations(failed)) {
      return this.compensate(failed, message);
    }
    return failed;
  }

  private hasCompensations(exec: WorkflowExecutionObject): boolean {
    const steps = this.requireDefinition(exec.body.workflowId).body.steps;
    const byId = new Map(steps.map((s) => [s.id, s] as const));
    return exec.body.completedSteps.some((id) => {
      const s = byId.get(id);
      return s?.kind === 'activity' && Boolean(s.compensateWith);
    });
  }

  // --- Replay / determinism (KMOS-0204 §23, KMOS-0150 §23) ---

  /**
   * Reconstruct an execution's state purely from its recorded events via the
   * kernel replay engine. This NEVER re-runs capabilities; it folds history.
   */
  reconstructExecution(executionId: CanonicalId): ExecutionState {
    const projection = executionProjection(executionId);
    return replay(this.bus.eventLog, projection, { now: this.now }).state;
  }

  // --- Internals ---

  private async resume(exec: WorkflowExecutionObject): Promise<WorkflowExecutionObject> {
    if (exec.body.state !== 'Running') return exec;
    return this.drive(exec);
  }

  /** Delegate work to the CapabilityInvoker port (the only place work happens). */
  private async invoke(
    exec: WorkflowExecutionObject,
    stepId: string,
    capabilityRef: CanonicalId | string,
    mapping: ActivityStep['input'],
  ): Promise<unknown> {
    const resolved = resolveInput(mapping, exec.body.input, exec.body.stepResults);
    const context: InvocationContext = {
      workflowId: exec.body.workflowId,
      executionId: exec.id,
      stepId,
      correlationId: exec.id,
    };
    return this.invoker.invoke(capabilityRef, resolved, context);
  }

  private advanceCursor(exec: WorkflowExecutionObject): WorkflowExecutionObject {
    const updated: WorkflowExecutionObject = {
      ...exec,
      version: exec.version + 1,
      updatedAt: this.now(),
      body: { ...exec.body, cursor: exec.body.cursor + 1 },
    };
    this.executions.put(updated);
    return updated;
  }

  /** Record a completed step into state and publish a StepCompleted-style event. */
  private async recordStep(
    executionId: CanonicalId,
    result: StepResult,
    eventType = 'StepCompleted',
    extraPayload: Record<string, unknown> = {},
  ): Promise<void> {
    const exec = this.requireExecution(executionId);
    const completedSteps = exec.body.completedSteps.includes(result.stepId)
      ? exec.body.completedSteps
      : [...exec.body.completedSteps, result.stepId];
    const updated: WorkflowExecutionObject = {
      ...exec,
      version: exec.version + 1,
      updatedAt: this.now(),
      body: {
        ...exec.body,
        stepResults: { ...exec.body.stepResults, [result.stepId]: result },
        completedSteps,
      },
    };
    this.executions.put(updated);
    await this.publish(eventType, executionId, {
      executionId,
      stepId: result.stepId,
      kind: result.kind,
      output: result.output,
      ...extraPayload,
    });
  }

  /** Apply a state transition (guarded by the canonical state machine). */
  private transition(
    exec: WorkflowExecutionObject,
    to: WorkflowExecutionState,
    opts: { waitingFor?: string; clearWaiting?: boolean; error?: string } = {},
  ): WorkflowExecutionObject {
    if (exec.body.state !== to && !canExecTransition(exec.body.state, to)) {
      throw new KmosError(`Illegal execution transition ${exec.body.state} -> ${to}`, {
        category: 'BusinessRule',
        code: 'workflow.state.illegal_transition',
        subject: exec.id,
        detail: { from: exec.body.state, to },
      });
    }
    const body: WorkflowExecutionBody = {
      ...exec.body,
      state: to,
      ...(opts.waitingFor !== undefined ? { waitingFor: opts.waitingFor } : {}),
      ...(opts.clearWaiting ? { waitingFor: undefined } : {}),
      ...(opts.error !== undefined ? { error: opts.error } : {}),
    };
    const updated: WorkflowExecutionObject = { ...exec, version: exec.version + 1, updatedAt: this.now(), body };
    this.executions.put(updated);
    return updated;
  }

  private async publish(type: string, subjectId: CanonicalId, payload: Record<string, unknown>): Promise<void> {
    const governance: EventGovernance = { executionId: subjectId };
    const ev = createEvent({ type, schemaVersion: '1.0', producer: 'WorkflowService', subjectId, payload, governance, time: this.now() });
    await this.bus.publish(ev, { streamId: subjectId });
  }

  private requireDefinition(id: CanonicalId): WorkflowDefinitionObject {
    const def = this.definitions.get(id);
    if (!def) throw new KmosError(`No such workflow: ${id}`, { category: 'NotFound', code: 'workflow.notfound', subject: id });
    return def;
  }

  private requireExecution(id: CanonicalId): WorkflowExecutionObject {
    const exec = this.executions.get(id);
    if (!exec) throw new KmosError(`No such execution: ${id}`, { category: 'NotFound', code: 'workflow.execution.notfound', subject: id });
    return exec;
  }
}
