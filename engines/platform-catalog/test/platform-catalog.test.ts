import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformCatalog } from '../src/index.js';

test('merged platform catalog covers kernel + all service + domain events', () => {
  const c = createPlatformCatalog();
  // kernel seed
  assert.ok(c.has('AssetRegistered'));
  assert.ok(c.has('KnowledgeUpdated'));
  // service extras
  assert.ok(c.has('PolicyRegistered'));      // governance
  assert.ok(c.has('CapabilityExecutionStarted')); // runtime
  assert.ok(c.has('StepCompleted'));         // workflow
  assert.ok(c.has('ConfigurationRegistered'));// configuration
  assert.ok(c.has('IndexRebuilt'));          // search
  // domain
  assert.ok(c.has('LectureProcessed'));
  assert.ok(c.has('PreservationCompleted'));
});

test('no duplicate registration errors when merging', () => {
  assert.doesNotThrow(() => createPlatformCatalog());
});
