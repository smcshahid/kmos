/**
 * M5 throughput performance SMOKE test (deterministic, not a benchmark).
 *
 * Publishes N=5000 canonical events to an in-memory EventBus (append-only log)
 * spread across several streams, then replays the entire log into a counting
 * projection. It asserts CORRECTNESS (total count, per-type count, and per-stream
 * ordering preserved) and a GENEROUS wall-clock bound so it stays stable in CI.
 *
 * This is a stability/regression guard, not a micro-benchmark: the time bound is
 * intentionally loose to avoid flakiness on slow or contended CI machines.
 * Measured durations are printed via console.log for visibility.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EventBus,
  createEvent,
  newCanonicalId,
  replay,
  type Projection,
  type StoredEvent,
} from '@kmos/canonical-kernel';

const fixedNow = (): string => '2026-06-30T00:00:00.000Z';

const N = 5000;
const STREAMS = 10;
/** Generous wall-clock budget for publish+replay of N events (loose, CI-stable). */
const PUBLISH_BUDGET_MS = 8000;
const REPLAY_BUDGET_MS = 4000;

interface CountState {
  total: number;
  byType: Record<string, number>;
  /** streamId -> ascending list of per-stream versions seen during replay. */
  perStreamVersions: Record<string, number[]>;
}

test('throughput smoke: publish and replay N=5000 events with correct counts, ordering, and loose timing', async () => {
  // Default bus uses the kernel's default catalog (AssetRegistered@1.0 is seeded).
  const bus = new EventBus();

  // Pre-create stable stream ids so events distribute deterministically.
  const streamIds: string[] = [];
  for (let i = 0; i < STREAMS; i += 1) streamIds.push(newCanonicalId('Asset'));

  // --- Publish N events (deterministic round-robin across streams). ---
  const publishStart = performance.now();
  for (let i = 0; i < N; i += 1) {
    const subjectId = streamIds[i % STREAMS]!;
    const event = createEvent({
      type: 'AssetRegistered',
      schemaVersion: '1.0',
      producer: 'AssetRegistry',
      subjectId,
      payload: { assetId: subjectId, seq: i },
      time: fixedNow(),
    });
    await bus.publish(event, { streamId: subjectId });
  }
  const publishMs = performance.now() - publishStart;

  assert.equal(bus.eventLog.size(), N, 'every published event landed in the log');
  assert.equal(bus.getDeadLetters().length, 0, 'no dead letters during publish');

  // --- Replay the entire immutable log into a counting projection. ---
  const counter: Projection<CountState> = {
    name: 'throughput-counter',
    initial: () => ({ total: 0, byType: {}, perStreamVersions: {} }),
    apply: (state, s: StoredEvent) => {
      state.total += 1;
      const type = s.event.identity.type;
      state.byType[type] = (state.byType[type] ?? 0) + 1;
      (state.perStreamVersions[s.streamId] ??= []).push(s.streamVersion);
      return state;
    },
  };

  const replayStart = performance.now();
  const { state, session } = replay(bus.eventLog, counter, { now: fixedNow });
  const replayMs = performance.now() - replayStart;

  // --- Correctness: counts. ---
  assert.equal(state.total, N, 'replay folded exactly N events');
  assert.equal(state.byType['AssetRegistered'], N, 'all events were AssetRegistered');
  assert.equal(session.eventsApplied, N, 'replay session reports N events applied');

  // --- Correctness: per-stream ordering preserved (1,2,3,... contiguous). ---
  let totalAcrossStreams = 0;
  for (const id of streamIds) {
    const versions = state.perStreamVersions[id] ?? [];
    totalAcrossStreams += versions.length;
    for (let v = 0; v < versions.length; v += 1) {
      assert.equal(versions[v], v + 1, `stream ${id} version ${v} is strictly ordered`);
    }
  }
  assert.equal(totalAcrossStreams, N, 'every event accounted for across streams');
  assert.equal(N % STREAMS, 0, 'even round-robin distribution (sanity)');
  for (const id of streamIds) {
    assert.equal((state.perStreamVersions[id] ?? []).length, N / STREAMS, 'balanced streams');
  }

  // --- Loose, CI-stable timing bounds (visibility via console.log). ---
  console.log(
    `[throughput-smoke] N=${N} streams=${STREAMS} ` +
      `publish=${publishMs.toFixed(1)}ms replay=${replayMs.toFixed(1)}ms ` +
      `(budgets publish<${PUBLISH_BUDGET_MS}ms replay<${REPLAY_BUDGET_MS}ms)`,
  );
  assert.ok(publishMs < PUBLISH_BUDGET_MS, `publish of ${N} events should be well under ${PUBLISH_BUDGET_MS}ms (was ${publishMs.toFixed(1)}ms)`);
  assert.ok(replayMs < REPLAY_BUDGET_MS, `replay of ${N} events should be well under ${REPLAY_BUDGET_MS}ms (was ${replayMs.toFixed(1)}ms)`);
});
