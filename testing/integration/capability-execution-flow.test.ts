/**
 * M2 integration test (KMOS-0204/0205/0210): the Capability Execution Platform.
 *
 * Proves the three M2 engines cooperate while staying decoupled:
 *   - Capability Registry catalogs an ABILITY (no implementation knowledge).
 *   - Capability Runtime EXECUTES a registered implementation behind the contract.
 *   - Workflow Service COORDINATES the ability via a CapabilityInvoker port,
 *     knowing only a capabilityRef — never the implementation (coordinate,
 *     never compute). Output flows between steps declaratively.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanonicalId } from '@kmos/canonical-kernel';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { WorkflowService } from '@kmos/workflow';
import type { CapabilityInvoker, InvocationContext } from '@kmos/workflow';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** Composition-root adapter: bind Workflow's invoker port to the Runtime. */
class RuntimeInvoker implements CapabilityInvoker {
  private readonly runtime: CapabilityRuntimeService;
  constructor(runtime: CapabilityRuntimeService) {
    this.runtime = runtime;
  }
  async invoke(ref: CanonicalId | string, input: Record<string, unknown>, _ctx: InvocationContext): Promise<unknown> {
    const res = await this.runtime.invoke(ref as CanonicalId, input);
    if (!res.success) throw res.error;
    return res.output;
  }
}

test('workflow coordinates a registered, runtime-executed capability end-to-end', async () => {
  const registry = new CapabilityRegistryService({ now: fixedNow });
  const runtime = new CapabilityRuntimeService({ now: fixedNow });
  const workflow = new WorkflowService({ invoker: new RuntimeInvoker(runtime), now: fixedNow });

  // 1) Registry: catalog two business abilities (no implementation knowledge).
  const contract = { acceptedObjects: ['Asset'], producedObjects: ['Transcript'], consumedEvents: [], publishedEvents: ['TranscriptGenerated'] };
  const transcribe = await registry.registerCapability({ name: 'SpeechRecognition', ownerDomain: 'Language', businessPurpose: 'Transcribe audio', version: '1.0.0', inputs: ['Asset'], outputs: ['Transcript'], contract });
  const extract = await registry.registerCapability({ name: 'KnowledgeExtraction', ownerDomain: 'Knowledge', businessPurpose: 'Extract concepts', version: '1.0.0', inputs: ['Transcript'], outputs: ['Concept'], contract: { ...contract, producedObjects: ['Concept'] } });

  // 2) Runtime: register implementations bound to the capability ids.
  await runtime.registerImplementation(transcribe.id, '1.0.0', {
    invoke: async (input: any) => ({ transcript: `transcript of ${input.audio}` }),
    health: () => 'Ready',
  });
  await runtime.registerImplementation(extract.id, '1.0.0', {
    invoke: async (input: any) => ({ concept: `concept from "${input.text}"` }),
    health: () => 'Ready',
  });

  // 3) Workflow: a declarative definition referencing capabilities by id only.
  const def = await workflow.registerWorkflow({
    name: 'lecture-preservation', ownerDomain: 'media', businessPurpose: 'transcribe then extract',
    steps: [
      { id: 'transcribe', kind: 'activity', capabilityRef: transcribe.id, input: { audio: '$input.audioRef' } },
      { id: 'extract', kind: 'activity', capabilityRef: extract.id, input: { text: '$steps.transcribe.transcript' } },
    ],
  });

  // 4) Run it.
  const exec = await workflow.start(def.id, { audioRef: 'kmos:Asset:lecture-001' });

  // The workflow coordinated; the runtime computed; output flowed between steps.
  assert.equal(exec.body.state, 'Completed');
  assert.deepEqual(exec.body.stepResults['transcribe']!.output, { transcript: 'transcript of kmos:Asset:lecture-001' });
  assert.deepEqual(exec.body.stepResults['extract']!.output, { concept: 'concept from "transcript of kmos:Asset:lecture-001"' });

  // The ability the workflow used is discoverable in the registry.
  const found = registry.discover({ ownerDomain: 'Language', output: 'Transcript' });
  assert.equal(found.length, 1);
  assert.equal(found[0]!.id, transcribe.id);
});

test('a failing capability implementation is contained and surfaces to the workflow', async () => {
  const runtime = new CapabilityRuntimeService({ now: fixedNow });
  const workflow = new WorkflowService({ invoker: new RuntimeInvoker(runtime), now: fixedNow });
  const capId = 'kmos:Capability:11111111-1111-4111-8111-111111111111' as CanonicalId;
  await runtime.registerImplementation(capId, '1.0.0', {
    invoke: async () => { throw new Error('model unavailable'); },
    health: () => 'Ready',
  });
  const def = await workflow.registerWorkflow({
    name: 'failing', ownerDomain: 'd', businessPurpose: 'x',
    steps: [{ id: 's1', kind: 'activity', capabilityRef: capId, input: {} }],
  });
  const exec = await workflow.start(def.id, {});
  assert.notEqual(exec.body.state, 'Completed'); // failure propagated, not silently completed
});
