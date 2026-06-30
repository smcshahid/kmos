/**
 * Execution-state projection (KMOS-0204 §23, KMOS-0150 §23; replay).
 *
 * An execution's state must be reconstructable purely from its recorded events.
 * This pure projection folds the workflow events on an execution's stream
 * (WorkflowStarted, StepCompleted, Human/Approval task events, state
 * transitions, compensation) into the canonical execution state. It is a
 * `Projection<ExecutionState>` usable directly with the kernel `replay` engine,
 * so reconstruction is deterministic and never re-runs capabilities.
 */

import type { Projection, StoredEvent } from '@kmos/canonical-kernel';
import type { StepResult, WorkflowExecutionState } from './model.js';

export interface ExecutionState {
  readonly executionId?: string;
  readonly workflowId?: string;
  readonly state: WorkflowExecutionState | 'Unknown';
  readonly stepResults: Record<string, StepResult>;
  readonly completedSteps: string[];
  readonly waitingFor?: string;
  readonly error?: string;
}

function emptyState(): ExecutionState {
  return { state: 'Unknown', stepResults: {}, completedSteps: [] };
}

/**
 * Build a replayable projection scoped to a single execution stream. Events for
 * other executions are ignored so the result reconstructs exactly one execution.
 */
export function executionProjection(executionId: string): Projection<ExecutionState> {
  return {
    name: `WorkflowExecution:${executionId}`,
    initial: emptyState,
    apply(state: ExecutionState, stored: StoredEvent): ExecutionState {
      const ev = stored.event;
      const subject = ev.identity.subjectId ?? (ev.payload as { executionId?: string }).executionId;
      if (subject !== executionId) return state;
      const payload = ev.payload as Record<string, unknown>;
      switch (ev.identity.type) {
        case 'WorkflowStarted':
          return {
            ...state,
            executionId,
            workflowId: payload['workflowId'] as string | undefined,
            state: 'Running',
          };
        case 'StepCompleted': {
          const stepId = payload['stepId'] as string;
          const result: StepResult = {
            stepId,
            kind: payload['kind'] as StepResult['kind'],
            output: payload['output'],
          };
          return {
            ...state,
            state: 'Running',
            stepResults: { ...state.stepResults, [stepId]: result },
            completedSteps: state.completedSteps.includes(stepId)
              ? state.completedSteps
              : [...state.completedSteps, stepId],
            waitingFor: undefined,
          };
        }
        case 'HumanTaskCreated':
        case 'ApprovalTaskCreated':
          return { ...state, state: 'Waiting', waitingFor: payload['stepId'] as string };
        case 'HumanTaskCompleted':
        case 'ApprovalTaskCompleted': {
          const stepId = payload['stepId'] as string;
          const result: StepResult = {
            stepId,
            kind: ev.identity.type === 'HumanTaskCompleted' ? 'humanTask' : 'approvalTask',
            output: payload['result'] ?? payload['verdict'],
          };
          return {
            ...state,
            state: 'Running',
            stepResults: { ...state.stepResults, [stepId]: result },
            completedSteps: state.completedSteps.includes(stepId)
              ? state.completedSteps
              : [...state.completedSteps, stepId],
            waitingFor: undefined,
          };
        }
        case 'WorkflowPaused':
          return { ...state, state: 'Paused' };
        case 'WorkflowResumed':
          return { ...state, state: 'Running' };
        case 'WorkflowCompleted':
          return { ...state, state: 'Completed', waitingFor: undefined };
        case 'WorkflowFailed':
          return { ...state, state: 'Failed', error: payload['error'] as string | undefined };
        case 'WorkflowCancelled':
          return { ...state, state: 'Cancelled', waitingFor: undefined };
        case 'CompensationStarted':
          return { ...state, state: 'Running' };
        case 'WorkflowCompensated':
          return { ...state, state: 'Compensated', waitingFor: undefined };
        default:
          return state;
      }
    },
  };
}
