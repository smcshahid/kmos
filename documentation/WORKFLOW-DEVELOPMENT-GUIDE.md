# KMOS Workflow Development Guide

_How to author, run, and observe a KMOS workflow — the declarative step model, input
mapping, the `CapabilityInvoker` port, human/approval tasks, compensation/saga,
determinism + replay, and events._

_Grounded in: `platform/workflow/src/domain/model.ts` (the step model + state machine),
`platform/workflow/src/domain/input-mapping.ts` (`$input.*` / `$steps.*`),
`platform/workflow/src/application/ports.ts` (the `CapabilityInvoker` + `TimerScheduler`
ports), `platform/workflow/src/application/workflow-service.ts` (the engine), and
`domains/media/src/*` (a domain that registers a workflow and runs it through the
runtime)._

_Last updated: 2026-06-30 · Audience: workflow authors, domain engineers._

---

## 0. The one rule: coordinate, never compute

The Workflow Service is the **institutional coordination engine**. It owns workflow
definitions and executions; it runs steps, human/approval tasks, parallel branches,
timers, and compensation. **It COORDINATES; it NEVER COMPUTES** (KMOS-0204 §1, KMOS-9999
§10). Every unit of business work is delegated to a **Capability** through the
`CapabilityInvoker` port. The engine treats a capability's output as **opaque** — it
never interprets business meaning.

Consequences you must respect when authoring:

- A workflow definition is **pure coordination**: there is no place to put business
  logic in it. If you find yourself wanting arithmetic on business values or branching on
  business meaning, that belongs in a **capability** (see
  `documentation/CAPABILITY-DEVELOPMENT-GUIDE.md`).
- The engine core is **deterministic**: no clocks, randomness, or IO live in it. Those
  arrive via injected ports (`now`, the `CapabilityInvoker`, the `TimerScheduler`).
- The engine **never imports the Capability Runtime or Registry** — only the
  `CapabilityInvoker` port. Cross-service contact is events + business APIs.

---

## 1. The declarative step model (KMOS-0150 / KMOS-0204)

A `WorkflowDefinitionBody` is `{ name, ownerDomain, businessPurpose, version, steps }`.
Definitions are **versioned and immutable** (KMOS-0150 §18); registering the same
name+ownerDomain again creates the next version. There are five step kinds
(`platform/workflow/src/domain/model.ts`):

| Kind | Shape | What it does |
|---|---|---|
| `activity` | `{ id, kind:'activity', capabilityRef, input?, compensateWith? }` | Invokes a capability with a mapped input (KMOS-0150 §8). The only place work happens. |
| `parallel` | `{ id, kind:'parallel', branches: WorkflowStep[][] }` | Runs branches concurrently, then synchronizes (KMOS-0150 §10). Branches support **activity steps only**. |
| `humanTask` | `{ id, kind:'humanTask', role, description? }` | Pauses for a governed human action (KMOS-0204 §14); execution → `Waiting`. |
| `approvalTask` | `{ id, kind:'approvalTask', approver, description? }` | Pauses for a governed approval verdict (KMOS-0204 §17). Rejection triggers compensation. |
| `compensation` | `{ id, kind:'compensation', capabilityRef, input? }` | A reverse action bound to a forward activity via `compensateWith`; never run forward — only during saga rollback (KMOS-0204 §18). |

### 1.1 Execution state machine (KMOS-0204 §19)

Executions move through guarded states: `Created → Scheduled/Running → (Waiting | Paused
| Retrying) → Completed | Failed | Cancelled | Compensated`. Illegal transitions throw a
`workflow.state.illegal_transition` `KmosError`. `Completed`, `Cancelled`, and
`Compensated` are terminal; `Failed` may transition only to `Compensated`.

---

## 2. Input mapping (`$input.*`, `$steps.*`) — pure data wiring

A step's `input` is a declarative `InputMapping`: a map of output field → source. The
resolver (`platform/workflow/src/domain/input-mapping.ts`) is **pure data wiring with no
business rules** — no arithmetic on business values, no branching on meaning. Three
source forms:

| Source form | Resolves to |
|---|---|
| `"$input.<path>"` | a field from the **execution input** (the object passed to `start`). |
| `"$steps.<id>.<path>"` | a field from a **completed step's output** (by step id). |
| anything else (string/number/boolean/null) | a **literal** value. |

`<path>` is dot-delimited and walks nested objects; a missing path resolves to
`undefined` (it does not throw). Example:

```ts
input: {
  audioRef: '$input.audioRef',            // from the execution input
  transcript: '$steps.transcribe.transcript',  // from the 'transcribe' step's output
  language: 'en',                          // a literal
}
```

---

## 3. The `CapabilityInvoker` port (coordinate, never compute)

The engine delegates **all** work through this port
(`platform/workflow/src/application/ports.ts`):

```ts
export interface CapabilityInvoker {
  invoke(
    capabilityRef: CanonicalId | string,
    input: Record<string, unknown>,
    context: InvocationContext,   // { workflowId, executionId, stepId, correlationId }
  ): Promise<unknown>;            // opaque output — the engine does not interpret it
}
```

If no invoker is injected, the engine uses a `NullInvoker` that **throws** on any work
(`workflow.invoker.missing`) — proving the engine performs no work itself. In a composed
system you inject an adapter that binds the port to the Capability Runtime. That adapter
lives in the **domain (composition layer)**, not in the engine
(`domains/media/src/infrastructure/runtime-invoker.ts`):

```ts
export class RuntimeCapabilityInvoker implements CapabilityInvoker {
  constructor(private readonly runtime: CapabilityRuntimeService) {}
  async invoke(ref, input, ctx) {
    const res = await this.runtime.invoke(ref as CanonicalId, input, {
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
    });
    if (!res.success) throw res.error;   // the Runtime isolates + classifies faults
    return res.output;
  }
}
```

This is the seam that keeps the engine decoupled from the runtime: the engine knows only
the port; the Runtime provides isolation, observability, and configuration around the
capability (see `documentation/CAPABILITY-DEVELOPMENT-GUIDE.md` §4).

---

## 4. Human tasks and approvals (KMOS-0204 §14 / §17)

When the engine reaches a `humanTask` or `approvalTask` step it **opens a task object,
transitions the execution to `Waiting`, publishes a `…Created` event, and returns** — the
execution pauses until the task is resolved out-of-band:

```ts
// Human task: resume with the human's result, recorded as the step output.
await workflow.completeHumanTask(taskId, { decision: 'accepted', note: 'looks good' });

// Approval task: a verdict. 'Approved' resumes; 'Rejected' triggers compensation (§5).
await workflow.completeApproval(taskId, 'Approved');
```

Inspect open tasks with `workflow.getHumanTasks(executionId)` /
`workflow.getApprovalTasks(executionId)`. Completing a task records the step result
(`HumanTaskCompleted` / `ApprovalTaskCompleted` events) and **resumes** the execution
from the next step.

---

## 5. Compensation / saga (KMOS-0204 §18)

Bind a reverse action to a forward activity with `compensateWith`, and define the
matching `compensation` step:

```ts
steps: [
  { id: 'reserve', kind: 'activity', capabilityRef: reserveCapId,
    input: { itemId: '$input.itemId' }, compensateWith: 'unreserve' },
  { id: 'approve', kind: 'approvalTask', approver: 'GovernanceBoard' },
  { id: 'unreserve', kind: 'compensation', capabilityRef: unreserveCapId,
    input: { itemId: '$input.itemId' } },
]
```

Compensation runs automatically on **failure** (if any completed step has a
compensation) and on **approval rejection**. The engine collects the completed steps,
builds a `CompensationPlan`, and invokes each bound compensation **in reverse completion
order** via the same `CapabilityInvoker` port, then transitions the execution to
`Compensated`. Events: `CompensationStarted` → (each reverse invocation) →
`CompensationCompleted` → `WorkflowCompensated`.

---

## 6. Determinism + replay (KMOS-0204 §23, KMOS-0150 §23)

The engine persists **coordination events** and can reconstruct an execution's state
**purely by folding those events** — it never re-runs capabilities to recover state:

```ts
const state = workflow.reconstructExecution(executionId);  // replay-derived, read-only
```

`reconstructExecution` runs the kernel `replay` engine over the execution's events with
an injected `now`. This is why the engine core is deterministic and why timers are armed
through the `TimerScheduler` port (the deterministic core has no clock): replay yields the
same state every time. The append-only event log is the system of record; execution state
is a projection (see `OPERATIONS-GUIDE.md` §6).

---

## 7. Events emitted by the engine

Every coordination action publishes a canonical event on the shared bus (stream =
subject id), so the whole workflow is observable and auditable:

- Lifecycle: `WorkflowRegistered`, `WorkflowStarted`, `WorkflowCompleted`,
  `WorkflowFailed`, `WorkflowCancelled`, `WorkflowPaused`, `WorkflowResumed`.
- Steps: `StepCompleted` (per step), parallel join recorded as a `parallel` step result.
- Tasks/timers: `HumanTaskCreated` / `HumanTaskCompleted`, `ApprovalTaskCreated` /
  `ApprovalTaskCompleted`, `TimerExpired`.
- Saga: `CompensationStarted`, `CompensationCompleted`, `WorkflowCompensated`.

Read an execution's event stream with `workflow.getExecutionHistory(executionId)`.
Workflow events carry `governance.executionId`, correlating every coordination event with
its execution.

---

## 8. A complete example (mirrors `domains/media`)

This is the pattern the Media domain uses end-to-end: register the ability, activate an
implementation in the runtime, register a declarative workflow that references the
capability, and run it through a runtime-bound invoker
(`domains/media/src/media-domain-service.ts`).

```ts
import { EventBus } from '@kmos/canonical-kernel';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { WorkflowService } from '@kmos/workflow';
import { transcription } from '@kmos/reference-capabilities';
import { RuntimeCapabilityInvoker } from '@kmos/media';   // the composition adapter

// 0) One shared canonical event bus across the composed services.
const bus = new EventBus();
const registry = new CapabilityRegistryService({ bus });
const runtime  = new CapabilityRuntimeService({ bus });

// 1) Catalog the ability + activate an implementation (see the Capability guide).
const d = transcription.descriptor;
const cap = await registry.registerCapability({
  name: d.name, ownerDomain: d.ownerDomain, businessPurpose: d.businessPurpose,
  version: d.version, inputs: [...d.inputs], outputs: [...d.outputs],
  contract: {
    acceptedObjects: [...d.contract.acceptedObjects],
    producedObjects: [...d.contract.producedObjects],
    consumedEvents: [...d.contract.consumedEvents],
    publishedEvents: [...d.contract.publishedEvents],
  },
});
await runtime.registerImplementation(cap.id, d.version, transcription.create());

// 2) Build the engine, injecting the runtime-bound CapabilityInvoker port.
const workflow = new WorkflowService({
  bus,
  invoker: new RuntimeCapabilityInvoker(runtime),
});

// 3) Register a declarative workflow that REFERENCES the capability by id.
const def = await workflow.registerWorkflow({
  name: 'media.transcribe',
  ownerDomain: 'Media',
  businessPurpose: 'Transcribe a lecture',
  steps: [
    { id: 'transcribe', kind: 'activity', capabilityRef: cap.id,
      input: { audioRef: '$input.audioRef' } },
  ],
});

// 4) Start an execution; the engine maps the input and delegates to the capability.
const exec = await workflow.start(def.id, { audioRef: 'kmos:Asset:lecture-001' });

// 5) Read the opaque step output (the engine never interpreted it).
const transcript = (exec.body.stepResults['transcribe']?.output as { transcript?: string })?.transcript;
console.log(exec.body.state, transcript);   // "Completed"  "[transcript of kmos:Asset:lecture-001]"
```

To make this an **approval-gated saga**, add an `approvalTask` after `transcribe` and a
`compensation` step bound via `compensateWith` — a `Rejected` verdict (or a downstream
failure) then rolls back through the invoker automatically (§5).

---

## 9. Run and observe

```bash
npm run fitness        # MUST pass — engine imports only the port, never the runtime
npm test               # run the suite (see domains/media/test/media-domain.test.ts)
npm run demo           # the reference demo runs the media transcription workflow live
```

Observe an execution programmatically:

```ts
exec.body.state;                                 // the execution state
exec.body.stepResults;                           // outputs of completed steps
workflow.getExecutionHistory(exec.id);           // the coordination event stream
workflow.reconstructExecution(exec.id);          // state rebuilt purely by replay
workflow.getApprovalTasks(exec.id);              // open approval tasks (if any)
```

---

## 10. Checklist for a new workflow

- [ ] Definition is **pure coordination** — no business logic; all work is in
      `activity`/`compensation` steps that reference capabilities.
- [ ] Inputs are wired with `$input.*` / `$steps.*` / literals only.
- [ ] A `CapabilityInvoker` is injected (in tests/composition); the engine itself
      computes nothing (the `NullInvoker` throws).
- [ ] Human/approval pauses use `humanTask` / `approvalTask`; resolved via
      `completeHumanTask` / `completeApproval`.
- [ ] Reversible activities declare `compensateWith` + a `compensation` step (saga).
- [ ] State is recoverable by `reconstructExecution` (replay), not by re-running work.
- [ ] `npm run fitness` and `npm test` green.

---

## 11. References

- **Source:** `platform/workflow/src/domain/model.ts` (steps + state machine +
  task/timer/compensation bodies), `platform/workflow/src/domain/input-mapping.ts`
  (`$input` / `$steps` resolver), `platform/workflow/src/application/ports.ts`
  (`CapabilityInvoker`, `TimerScheduler`),
  `platform/workflow/src/application/workflow-service.ts` (the engine),
  `domains/media/src/media-domain-service.ts` +
  `domains/media/src/infrastructure/runtime-invoker.ts` (composition).
- **Specs:** KMOS-0150 (declarative workflow definitions: steps §8, parallel §10,
  immutability §18), KMOS-0204 (Workflow Service: coordination §1, execution §12/§13,
  human §14, approval §17, compensation §18, state machine §19, replay §23), KMOS-9999
  §10 (coordinate, never compute).
- **Companion docs:** `documentation/CAPABILITY-DEVELOPMENT-GUIDE.md`,
  `documentation/DEVELOPER-GUIDE.md`, `documentation/ARCHITECTURE.md`,
  `documentation/OPERATIONS-GUIDE.md` (§6 replay/DR).
