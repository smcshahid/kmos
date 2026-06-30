import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventBus,
  KmosError,
  newCanonicalId,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import {
  CapabilityRuntimeService,
  StaticConfigurationPort,
  createRuntimeCatalog,
  type CapabilityHandler,
  type HealthState,
  type InvocationContext,
} from '../src/index.js';

const fixedNow = () => '2026-06-30T00:00:00.000Z';

/** A bus bound to the runtime catalog that records every published event type. */
function recordingBus(): { bus: EventBus; types: string[]; events: StoredEvent[] } {
  const bus = new EventBus({ catalog: createRuntimeCatalog() });
  const types: string[] = [];
  const events: StoredEvent[] = [];
  bus.subscribe({
    subscriber: 'test-recorder',
    eventTypes: ['*'],
    handler: (stored) => {
      types.push(stored.event.identity.type);
      events.push(stored);
    },
  });
  return { bus, types, events };
}

/** A simple handler whose behaviour and health are controllable. */
function handler(
  fn: (input: unknown, ctx: InvocationContext) => unknown,
  health: HealthState = 'Ready',
): CapabilityHandler {
  return {
    async invoke(input, ctx) {
      return fn(input, ctx);
    },
    health() {
      return health;
    },
  };
}

test('invoke success returns output and emits Started then Completed (KMOS-0210 §3)', async () => {
  const { bus, types } = recordingBus();
  const runtime = new CapabilityRuntimeService({ bus, now: fixedNow });
  const capId = newCanonicalId('Capability');

  await runtime.registerImplementation(
    capId,
    '1.0.0',
    handler((input) => ({ echoed: input })),
  );

  const result = await runtime.invoke(capId, { value: 42 });

  assert.equal(result.success, true);
  assert.deepEqual(result.output, { echoed: { value: 42 } });
  assert.equal(result.version, '1.0.0');
  assert.deepEqual(types, [
    'CapabilityRuntimeRegistered',
    'CapabilityExecutionStarted',
    'CapabilityExecutionCompleted',
  ]);
});

test('a throwing handler is contained, emits Failed with a classified KmosError, and does NOT break a subsequent invoke (isolation, KMOS-0160 §21)', async () => {
  const { bus, types, events } = recordingBus();
  const runtime = new CapabilityRuntimeService({ bus, now: fixedNow });
  const badId = newCanonicalId('Capability');
  const goodId = newCanonicalId('Capability');

  await runtime.registerImplementation(
    badId,
    '1.0.0',
    handler(() => {
      throw new Error('boom from inside the capability');
    }),
  );
  await runtime.registerImplementation(
    goodId,
    '1.0.0',
    handler(() => 'ok'),
  );

  // The failing invoke does not throw across the boundary.
  const failed = await runtime.invoke(badId, {});
  assert.equal(failed.success, false);
  assert.ok(failed.error instanceof KmosError);
  assert.equal(failed.error?.category, 'Infrastructure');
  assert.equal(failed.error?.code, 'capability.execution.unhandled');
  assert.ok(types.includes('CapabilityExecutionFailed'));

  // The classified error is carried in the failure event payload.
  const failEvent = events.find((e) => e.event.identity.type === 'CapabilityExecutionFailed');
  assert.ok(failEvent);
  const payload = failEvent!.event.payload as { error: { category: string; code: string } };
  assert.equal(payload.error.category, 'Infrastructure');

  // Isolation: an unrelated capability still succeeds afterwards.
  const ok = await runtime.invoke(goodId, {});
  assert.equal(ok.success, true);
  assert.equal(ok.output, 'ok');
});

test('a handler throwing a KmosError preserves its business classification', async () => {
  const runtime = new CapabilityRuntimeService({ now: fixedNow });
  const capId = newCanonicalId('Capability');
  await runtime.registerImplementation(
    capId,
    '1.0.0',
    handler(() => {
      throw new KmosError('bad input', {
        category: 'Validation',
        code: 'demo.input.invalid',
      });
    }),
  );

  const result = await runtime.invoke(capId, {});
  assert.equal(result.success, false);
  assert.equal(result.error?.category, 'Validation');
  assert.equal(result.error?.code, 'demo.input.invalid');
  assert.equal(result.error?.retryable, false);
});

test('health reflects handler state (KMOS-0160 §14)', async () => {
  const runtime = new CapabilityRuntimeService({ now: fixedNow });
  const capId = newCanonicalId('Capability');

  // Unknown before any implementation is registered.
  assert.equal(runtime.health(capId), 'Unknown');

  await runtime.registerImplementation(capId, '1.0.0', handler(() => 'x', 'Degraded'));
  assert.equal(runtime.health(capId), 'Degraded');
});

test('an unavailable handler is not invoked; failure is transient/retryable', async () => {
  const runtime = new CapabilityRuntimeService({ now: fixedNow });
  const capId = newCanonicalId('Capability');
  let invoked = false;
  await runtime.registerImplementation(
    capId,
    '1.0.0',
    handler(() => {
      invoked = true;
      return 'unreachable';
    }, 'Unavailable'),
  );

  const result = await runtime.invoke(capId, {});
  assert.equal(invoked, false);
  assert.equal(result.success, false);
  assert.equal(result.error?.category, 'Transient');
  assert.equal(result.error?.retryable, true);
});

test('swapping the implementation behind the SAME capabilityId yields the same contract behaviour (AI/model independence, KMOS-0160 §3)', async () => {
  const runtime = new CapabilityRuntimeService({ now: fixedNow });
  const capId = newCanonicalId('Capability');

  // Implementation A (e.g. one model).
  await runtime.registerImplementation(
    capId,
    '1.0.0',
    handler((input) => ({ summary: `A:${(input as { text: string }).text}` })),
  );
  const a = await runtime.invoke(capId, { text: 'hello' });

  // Implementation B (e.g. a different model/technology), same contract shape.
  await runtime.registerImplementation(
    capId,
    '2.0.0',
    handler((input) => ({ summary: `B:${(input as { text: string }).text}` })),
  );
  const b = await runtime.invoke(capId, { text: 'hello' });

  // Same contract: both succeed and return the agreed output shape.
  assert.equal(a.success, true);
  assert.equal(b.success, true);
  assert.ok('summary' in (a.output as object));
  assert.ok('summary' in (b.output as object));
  // The active implementation was swapped behind the same id.
  assert.equal(a.version, '1.0.0');
  assert.equal(b.version, '2.0.0');
});

test('resolver returns the active version; a specific version can still be invoked', async () => {
  const runtime = new CapabilityRuntimeService({ now: fixedNow });
  const capId = newCanonicalId('Capability');

  await runtime.registerImplementation(capId, '1.0.0', handler(() => 'v1'));
  assert.equal(runtime.activeVersion(capId), '1.0.0');

  await runtime.registerImplementation(capId, '2.0.0', handler(() => 'v2'));
  assert.equal(runtime.activeVersion(capId), '2.0.0');

  // Active resolves to the latest.
  const latest = await runtime.invoke(capId, {});
  assert.equal(latest.output, 'v2');
  assert.equal(latest.version, '2.0.0');
});

test('external configuration is resolved through the port and passed into context (KMOS-0160 §9)', async () => {
  const config = new StaticConfigurationPort();
  const runtime = new CapabilityRuntimeService({ configuration: config, now: fixedNow });
  const capId = newCanonicalId('Capability');

  config.set(capId, '1.0.0', { model: 'gpt-x', maxTokens: 1024 });

  let seen: InvocationContext | undefined;
  await runtime.registerImplementation(
    capId,
    '1.0.0',
    handler((_input, ctx) => {
      seen = ctx;
      return 'done';
    }),
  );

  const result = await runtime.invoke(capId, {});
  assert.equal(result.success, true);
  assert.deepEqual(seen?.configuration, { model: 'gpt-x', maxTokens: 1024 });
});

test('invoking an unregistered capability is contained as a NotFound failure', async () => {
  const runtime = new CapabilityRuntimeService({ now: fixedNow });
  const capId = newCanonicalId('Capability');

  const result = await runtime.invoke(capId, {});
  assert.equal(result.success, false);
  assert.equal(result.error?.category, 'NotFound');
  assert.equal(result.error?.code, 'capability.implementation.notfound');
});

test('the default bus rejects event types absent from the runtime catalog', () => {
  // Sanity: createRuntimeCatalog includes kernel defaults plus runtime events.
  const catalog = createRuntimeCatalog();
  assert.ok(catalog.has('AssetRegistered')); // kernel default
  assert.ok(catalog.has('CapabilityExecutionStarted')); // runtime extension
  assert.ok(catalog.has('CapabilityRuntimeRegistered'));
  assert.equal(catalog.has('NotARealEvent'), false);
});
