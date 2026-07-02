import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlatformRuntime, createPlatformRuntimeFromEnv, hydratePlatformRuntime, newInMemoryEventLog,
} from '../src/index.js';

test('createPlatformRuntime composes the 8 platform services on one bus', () => {
  const rt = createPlatformRuntime();
  for (const k of ['bus', 'identity', 'assets', 'knowledge', 'governance', 'events', 'registry', 'runtime', 'search'] as const) {
    assert.ok(rt[k], `runtime.${k} should be composed`);
  }
});

test('the composed substrate runs an end-to-end capability invocation and search', async () => {
  const rt = createPlatformRuntime();
  const org = await rt.identity.createOrganization('SDK Test Org');

  // Capability registry + runtime wired on the same bus.
  const cap = await rt.registry.registerCapability({
    name: 'Echo', ownerDomain: 'Test', businessPurpose: 'echo input', version: '1.0.0',
    inputs: ['X'], outputs: ['X'],
    contract: { acceptedObjects: ['X'], producedObjects: ['X'], consumedEvents: [], publishedEvents: [] },
  });
  await rt.runtime.registerImplementation(cap.id, '1.0.0', {
    health: () => 'Ready',
    invoke: async (input: unknown) => ({ echoed: input }),
  });
  const res = await rt.runtime.invoke(cap.id, { hello: 'world' });
  assert.equal(res.success, true, res.error?.message);
  assert.deepEqual(res.output, { echoed: { hello: 'world' } });

  // Knowledge + search wired on the same bus.
  const concept = await rt.knowledge.createKnowledge({
    category: 'Concept', canonicalName: 'Sincerity', definition: 'Honesty of intent.',
    primaryLanguage: 'en', organizationId: org.id,
  });
  await rt.search.rebuild();
  const hits = rt.search.search('Sincerity', { limit: 10 });
  assert.ok(hits.some((h) => h.subjectId === concept.id), 'search finds the indexed concept');
});

test('boot recovery: a fresh runtime rebuilds read models from the durable log (ADR-0011)', async () => {
  const log = newInMemoryEventLog();
  const rt1 = createPlatformRuntime({ log });
  const org = await rt1.identity.createOrganization('Recovery Org');
  const concept = await rt1.knowledge.createKnowledge({
    category: 'Concept', canonicalName: 'Patience', definition: 'Steadfast endurance.',
    primaryLanguage: 'en', organizationId: org.id,
  });

  // A NEW runtime sharing the same durable log starts empty, then hydrates identically.
  const rt2 = createPlatformRuntime({ log });
  assert.equal(rt2.knowledge.getKnowledge(concept.id), undefined, 'empty before hydrate');
  await hydratePlatformRuntime(rt2);
  const recovered = rt2.knowledge.getKnowledge(concept.id);
  assert.ok(recovered, 'knowledge recovered after hydrate');
  assert.equal(recovered!.body.canonicalName, 'Patience');
});

test('createPlatformRuntimeFromEnv with no database URL yields an in-memory runtime', async () => {
  const rt = await createPlatformRuntimeFromEnv({});
  assert.ok(rt.bus && rt.knowledge, 'in-memory runtime composed without a database');
});
