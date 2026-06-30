/**
 * Workflow Service local event catalog (KMOS-0204 §9).
 *
 * The kernel seed registers only a subset of workflow events
 * (WorkflowRegistered/Started/Completed/Cancelled, HumanTaskCreated,
 * ApprovalTaskCompleted, CompensationStarted). The remaining canonical
 * workflow events the service publishes (KMOS-0204 §9) are NOT in the seed,
 * so the Workflow Service registers them on a LOCAL catalog and constructs its
 * EventBus with that catalog. This avoids inventing private vocabularies while
 * keeping the kernel seed untouched (Constitution §3; Readiness Report R-02).
 *
 * Building on a fresh `EventCatalog()` would lose the seeded types, so we start
 * from the kernel's default list and ADD the missing workflow types.
 */

import { EventCatalog, defaultEventCatalog, type EventTypeDefinition } from '@kmos/canonical-kernel';

/** Canonical workflow events that are NOT part of the kernel seed (KMOS-0204 §9). */
const WORKFLOW_LOCAL_EVENTS: readonly EventTypeDefinition[] = [
  { type: 'WorkflowPaused', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'WorkflowResumed', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'WorkflowFailed', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'WorkflowRetried', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'WorkflowCompensated', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'StepCompleted', owner: 'WorkflowService', eventClass: 'Operational', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'StepFailed', owner: 'WorkflowService', eventClass: 'Operational', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'HumanTaskCompleted', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'ApprovalTaskCreated', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'TimerExpired', owner: 'WorkflowService', eventClass: 'Operational', schemaVersion: '1.0', category: 'Workflow' },
  { type: 'CompensationCompleted', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Workflow' },
];

/**
 * Build the Workflow Service's event catalog: the kernel seed plus the workflow
 * events the seed omits. Idempotent per call (a fresh catalog each time).
 */
export function createWorkflowCatalog(): EventCatalog {
  const catalog = new EventCatalog(defaultEventCatalog.list());
  for (const def of WORKFLOW_LOCAL_EVENTS) {
    if (!catalog.has(def.type)) catalog.register(def);
  }
  return catalog;
}
