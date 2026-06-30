/**
 * Workflow Service domain model (KMOS-0204, KMOS-0150).
 *
 * Declarative workflow definitions and execution state. The model is PURE: it
 * describes coordination only and contains NO business logic. Every unit of
 * work is a reference (capabilityRef + input mapping) that the engine delegates
 * to a Capability through the CapabilityInvoker port. Workflow definitions are
 * versioned and immutable (KMOS-0150 §18).
 */

import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';

/** Canonical workflow execution states (KMOS-0204 §19, KMOS-0150 §15). */
export const WORKFLOW_EXECUTION_STATES = [
  'Created',
  'Scheduled',
  'Running',
  'Waiting',
  'Paused',
  'Retrying',
  'Completed',
  'Failed',
  'Cancelled',
  'Compensated',
] as const;
export type WorkflowExecutionState = (typeof WORKFLOW_EXECUTION_STATES)[number];

/** Allowed forward transitions of the execution state machine (KMOS-0204 §19). */
const ALLOWED_EXEC: Readonly<Record<WorkflowExecutionState, readonly WorkflowExecutionState[]>> = {
  Created: ['Scheduled', 'Running', 'Cancelled'],
  Scheduled: ['Running', 'Cancelled'],
  Running: ['Waiting', 'Paused', 'Retrying', 'Completed', 'Failed', 'Cancelled', 'Compensated'],
  Waiting: ['Running', 'Paused', 'Cancelled', 'Failed', 'Compensated'],
  Paused: ['Running', 'Cancelled'],
  Retrying: ['Running', 'Failed', 'Cancelled', 'Compensated'],
  Completed: [],
  Failed: ['Compensated'],
  Cancelled: [],
  Compensated: [],
};

export function canExecTransition(from: WorkflowExecutionState, to: WorkflowExecutionState): boolean {
  return ALLOWED_EXEC[from].includes(to);
}

/** A static mapping from a context path to a literal/ref, resolved at run time. */
export interface InputMapping {
  /** Map of output field -> source. Source forms: "$input.x", "$steps.id.y", or a literal. */
  readonly [field: string]: string | number | boolean | null;
}

export type StepKind = 'activity' | 'parallel' | 'humanTask' | 'approvalTask' | 'compensation';

/** Base fields shared by every step. */
export interface StepBase {
  /** Stable step identifier, unique within the definition. */
  readonly id: string;
  readonly kind: StepKind;
}

/** Activity step: invokes a capability with a mapped input (KMOS-0150 §8). */
export interface ActivityStep extends StepBase {
  readonly kind: 'activity';
  readonly capabilityRef: CanonicalId | string;
  readonly input?: InputMapping;
  /** Optional id of a compensation step that reverses this activity. */
  readonly compensateWith?: string;
}

/** Parallel step: a set of branches run concurrently then synchronize (KMOS-0150 §10). */
export interface ParallelStep extends StepBase {
  readonly kind: 'parallel';
  readonly branches: readonly (readonly WorkflowStep[])[];
}

/** Human task step: pauses for a governed human action (KMOS-0204 §14). */
export interface HumanTaskStep extends StepBase {
  readonly kind: 'humanTask';
  readonly role: string;
  readonly description?: string;
}

/** Approval task step: pauses for a governed approval verdict (KMOS-0204 §17). */
export interface ApprovalTaskStep extends StepBase {
  readonly kind: 'approvalTask';
  readonly approver: string;
  readonly description?: string;
}

/** Compensation step: a reverse action bound to a forward step (KMOS-0204 §18). */
export interface CompensationStep extends StepBase {
  readonly kind: 'compensation';
  readonly capabilityRef: CanonicalId | string;
  readonly input?: InputMapping;
}

export type WorkflowStep =
  | ActivityStep
  | ParallelStep
  | HumanTaskStep
  | ApprovalTaskStep
  | CompensationStep;

/** Declarative workflow definition body (KMOS-0150 §5). */
export interface WorkflowDefinitionBody {
  readonly name: string;
  readonly ownerDomain: string;
  readonly businessPurpose: string;
  readonly version: number;
  readonly steps: readonly WorkflowStep[];
}

export type WorkflowDefinitionObject = CanonicalObject<WorkflowDefinitionBody>;

/** Recorded result of one completed step (execution history, KMOS-0150 §19). */
export interface StepResult {
  readonly stepId: string;
  readonly kind: StepKind;
  readonly output: unknown;
}

/** Workflow execution body (KMOS-0204 §13). */
export interface WorkflowExecutionBody {
  readonly workflowId: CanonicalId;
  readonly definitionVersion: number;
  readonly state: WorkflowExecutionState;
  readonly input: Record<string, unknown>;
  /** Outputs of completed steps, keyed by stepId. */
  readonly stepResults: Readonly<Record<string, StepResult>>;
  /** Ids of forward steps completed so far, in order (for compensation). */
  readonly completedSteps: readonly string[];
  /** Index of the next top-level step to execute. */
  readonly cursor: number;
  /** Id of the open task/timer the execution is waiting on, if any. */
  readonly waitingFor?: string;
  readonly error?: string;
}

export type WorkflowExecutionObject = CanonicalObject<WorkflowExecutionBody>;

/** Human task body (KMOS-0204 §14). */
export interface HumanTaskBody {
  readonly executionId: CanonicalId;
  readonly stepId: string;
  readonly role: string;
  readonly description?: string;
  readonly status: 'Open' | 'Completed';
  readonly result?: unknown;
}
export type HumanTaskObject = CanonicalObject<HumanTaskBody>;

/** Approval task body (KMOS-0204 §17). */
export interface ApprovalTaskBody {
  readonly executionId: CanonicalId;
  readonly stepId: string;
  readonly approver: string;
  readonly description?: string;
  readonly status: 'Open' | 'Completed';
  readonly verdict?: 'Approved' | 'Rejected';
}
export type ApprovalTaskObject = CanonicalObject<ApprovalTaskBody>;

/** Workflow timer body (KMOS-0204 §5; fired via an injectable mechanism). */
export interface TimerBody {
  readonly executionId: CanonicalId;
  readonly stepId: string;
  readonly status: 'Armed' | 'Expired' | 'Cancelled';
}
export type TimerObject = CanonicalObject<TimerBody>;

/** A planned compensation action for a completed step (KMOS-0204 §18). */
export interface CompensationAction {
  readonly forStepId: string;
  readonly capabilityRef: CanonicalId | string;
  readonly input?: InputMapping;
}

/** Compensation plan body: the reverse actions for an execution (KMOS-0204 §18). */
export interface CompensationPlanBody {
  readonly executionId: CanonicalId;
  /** Actions in the order they should run (reverse of completion order). */
  readonly actions: readonly CompensationAction[];
}
export type CompensationPlanObject = CanonicalObject<CompensationPlanBody>;
