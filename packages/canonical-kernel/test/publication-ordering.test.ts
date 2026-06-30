/**
 * Publication-ordering contract (KEP-001 §1.2, Decision KEP-D1).
 *
 * Normative: `EventBus.publish(event)` resolves ONLY AFTER (1) the event is
 * durably appended to the immutable log, and (2) all matching in-process
 * subscribers have been delivered. This codifies the await-everywhere contract
 * that makes in-process semantics identical to real async storage and keeps
 * event capture deterministic (no `flush()`/`tick()` hacks).
 *
 * The probe below genuinely distinguishes await-everywhere from fire-and-forget:
 * a deferred (un-awaited) dispatch would deliver AFTER the post-`await` line ran,
 * flipping `deliveredAtProgress` from 0 to 1.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus, createEvent, newCanonicalId, type StoredEvent } from '../src/index.js';

test('await publish resolves only after BOTH append and dispatch (KEP-D1)', async () => {
  const bus = new EventBus();
  const assetId = newCanonicalId('Asset');

  let progress = 0;
  let invocations = 0;
  let deliveredAtProgress = -1;
  bus.subscribe({
    subscriber: 'ordering-probe',
    eventTypes: ['*'],
    handler: (_stored: StoredEvent) => {
      invocations += 1;
      deliveredAtProgress = progress; // captured at delivery time
    },
  });

  // Nothing appended or delivered before publish.
  assert.equal(await bus.eventLog.size(), 0);

  const e = createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    subjectId: assetId,
    payload: { assetId },
  });
  const stored = await bus.publish(e, { streamId: assetId });
  progress = 1; // the first statement AFTER the awaited publish

  // (1) durably appended before publish resolved
  assert.equal(stored.streamVersion, 1);
  assert.equal(await bus.eventLog.size(), 1);
  assert.equal(await bus.eventLog.currentVersion(assetId), 1);

  // (2) the subscriber was delivered exactly once, DURING the awaited publish
  //     (it observed progress === 0, before the post-await statement ran). A
  //     fire-and-forget dispatch would have observed progress === 1 (or -1).
  assert.equal(invocations, 1, 'subscriber delivered exactly once');
  assert.equal(deliveredAtProgress, 0, 'delivery completed before publish() resolved');
});

test('a subscriber registered AFTER publish does not receive the past event (no replay-on-subscribe)', async () => {
  const bus = new EventBus();
  const assetId = newCanonicalId('Asset');
  const e = createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    subjectId: assetId,
    payload: { assetId },
  });
  await bus.publish(e, { streamId: assetId });

  let late = 0;
  bus.subscribe({ subscriber: 'late', eventTypes: ['*'], handler: () => { late += 1; } });
  // Publish a second event; the late subscriber sees only events from now on.
  const e2 = createEvent({
    type: 'AssetUpdated',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    subjectId: assetId,
    payload: { assetId },
  });
  await bus.publish(e2, { streamId: assetId });
  assert.equal(late, 1, 'late subscriber received only the post-subscription event');
});
