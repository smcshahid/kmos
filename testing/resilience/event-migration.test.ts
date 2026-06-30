/**
 * M5 event-schema-evolution resilience test (KMOS-0110 §10, KMOS-0203 §12).
 *
 * Proves schema evolution with backward compatibility and historical replay:
 *  1. Register an event schema v1.0 and publish v1.0 events.
 *  2. Register a BACKWARD-compatible v1.1 (adds an OPTIONAL field) -> accepted.
 *  3. Register an INCOMPATIBLE change (adds a REQUIRED field) -> rejected.
 *  4. Assert OLD v1.0 events still validate AND still replay after the schema
 *     evolved, so historical replay remains supported across migrations.
 *
 * The bus catalog pins the canonical event type ("AssetRegistered") at envelope
 * schemaVersion "1.0"; the EventService schema REGISTRY independently evolves the
 * payload contract. Backward compatibility guarantees historical payloads keep
 * passing the newest registered schema.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEvent,
  newCanonicalId,
  type Projection,
  type Schema,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import { EventService } from '@kmos/events';

const fixedNow = (): string => '2026-06-30T00:00:00.000Z';

const SCHEMA_V1_0: Schema = {
  type: 'object',
  required: ['assetId'],
  properties: { assetId: { type: 'string', format: 'canonical-id' } },
};

// v1.1 ADDS an OPTIONAL field (mediaType) — backward compatible.
const SCHEMA_V1_1: Schema = {
  type: 'object',
  required: ['assetId'],
  properties: {
    assetId: { type: 'string', format: 'canonical-id' },
    mediaType: { type: 'string' },
  },
};

// v2.0 ADDS a REQUIRED field (mediaType) — breaking; must be rejected.
const SCHEMA_V2_0: Schema = {
  type: 'object',
  required: ['assetId', 'mediaType'],
  properties: {
    assetId: { type: 'string', format: 'canonical-id' },
    mediaType: { type: 'string' },
  },
};

test('event migration: backward-compatible evolution is accepted, breaking change rejected, history still replays', async () => {
  const svc = new EventService({ now: fixedNow });

  // --- 1) Register v1.0 and publish some v1.0 events. ---
  await svc.registerEventSchema({ eventType: 'AssetRegistered', version: '1.0', schema: SCHEMA_V1_0 });

  const idA = newCanonicalId('Asset');
  const idB = newCanonicalId('Asset');
  const v1eventA = createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    subjectId: idA,
    payload: { assetId: idA },
  });
  const v1eventB = createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0',
    producer: 'AssetRegistry',
    subjectId: idB,
    payload: { assetId: idB },
  });
  await svc.publishEvent({ event: v1eventA, streamId: idA });
  await svc.publishEvent({ event: v1eventB, streamId: idB });

  // Both v1.0 events validate against the v1.0 registered schema.
  assert.doesNotThrow(() => svc.validateEvent(v1eventA));
  assert.doesNotThrow(() => svc.validateEvent(v1eventB));

  // --- 2) Backward-compatible v1.1 (adds optional field) is ACCEPTED. ---
  await assert.doesNotReject(() =>
    svc.registerEventSchema({ eventType: 'AssetRegistered', version: '1.1', schema: SCHEMA_V1_1 }),
  );

  // --- 3) Incompatible v2.0 (adds required field) is REJECTED. ---
  await assert.rejects(
    () => svc.registerEventSchema({ eventType: 'AssetRegistered', version: '2.0', schema: SCHEMA_V2_0 }),
    /not BACKWARD compatible/,
    'adding a required field must be rejected as a breaking change',
  );

  // --- 4a) OLD v1.0 events STILL VALIDATE after the schema evolved to v1.1. ---
  // validateEvent checks against the LATEST registered schema (v1.1); because the
  // evolution was backward compatible, the historical payloads still pass.
  assert.doesNotThrow(
    () => svc.validateEvent(v1eventA),
    'historical v1.0 event still validates under evolved v1.1 schema',
  );
  assert.doesNotThrow(() => svc.validateEvent(v1eventB));

  // A new v1.1-shaped event (with the added optional field) also validates.
  const idC = newCanonicalId('Asset');
  const v11event = createEvent({
    type: 'AssetRegistered',
    schemaVersion: '1.0', // envelope/catalog version is pinned; payload follows v1.1
    producer: 'AssetRegistry',
    subjectId: idC,
    payload: { assetId: idC, mediaType: 'audio/wav' },
  });
  assert.doesNotThrow(() => svc.validateEvent(v11event));
  await svc.publishEvent({ event: v11event, streamId: idC });

  // --- 4b) HISTORICAL REPLAY remains supported across the migration. ---
  const collect: Projection<StoredEvent[]> = {
    name: 'asset-registered-collector',
    initial: () => [],
    apply: (state, s: StoredEvent) =>
      s.event.identity.type === 'AssetRegistered' ? [...state, s] : state,
  };
  const { state: replayed } = await svc.replayEvents(collect);

  // All three AssetRegistered events (2x v1.0 + 1x v1.1) replay from history.
  assert.equal(replayed.length, 3, 'all historical AssetRegistered events replay');
  const replayedIds = replayed.map((s) => s.event.identity.subjectId).sort();
  assert.deepEqual(replayedIds, [idA, idB, idC].sort(), 'exact historical events recovered');

  // Each replayed historical payload re-validates under the evolved schema —
  // i.e. replaying old data after a schema migration does not break validation.
  for (const stored of replayed) {
    assert.doesNotThrow(
      () => svc.validateEvent(stored.event),
      `replayed historical event ${stored.event.identity.eventId} validates post-migration`,
    );
  }

  assert.equal(svc.getDeadLetterQueue().length, 0, 'no dead letters across the migration');
});
