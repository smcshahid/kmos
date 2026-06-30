/**
 * Replay engine (KMOS-0203 §14, KMOS-10040 §18).
 *
 * Replay is a first-class capability. It reads the immutable append-only log in
 * global sequence order and folds events into a projection (a "shadow
 * projection" that can be swapped atomically by the caller). Replay NEVER
 * mutates history; replay metadata (run id, range, checkpoint, timing) is
 * recorded SEPARATELY in a ReplaySession, exactly as the spec requires.
 */

import { newCanonicalId, type CanonicalId } from '../identifiers.js';
import type { EventLog, StoredEvent } from './append-log.js';

/** A pure projection: a reducer folding stored events into read-model state. */
export interface Projection<S> {
  readonly name: string;
  initial(): S;
  apply(state: S, stored: StoredEvent): S;
}

/** Replay metadata, recorded separately from event history. */
export interface ReplaySession {
  readonly id: CanonicalId;
  readonly projection: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly eventsApplied: number;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface ReplayResult<S> {
  readonly state: S;
  readonly session: ReplaySession;
}

export interface ReplayOptions {
  readonly fromSequence?: number;
  /** Inclusive upper bound on global sequence; defaults to end of log. */
  readonly toSequence?: number;
  /** Deterministic clock for session timestamps (tests/replay). */
  readonly now?: () => string;
}

/**
 * Rebuild a projection by replaying the immutable log. Returns the resulting
 * state plus a ReplaySession describing the run. The log is read-only here.
 */
export async function replay<S>(
  log: EventLog,
  projection: Projection<S>,
  options: ReplayOptions = {},
): Promise<ReplayResult<S>> {
  const clock = options.now ?? (() => new Date().toISOString());
  const startedAt = clock();
  const from = options.fromSequence ?? 1;
  const events = await log.read(from);
  const upper = options.toSequence ?? Number.POSITIVE_INFINITY;

  let state = projection.initial();
  let applied = 0;
  let lastSeq = from > 0 ? from - 1 : 0;
  for (const stored of events) {
    if (stored.sequence > upper) break;
    state = projection.apply(state, stored);
    applied += 1;
    lastSeq = stored.sequence;
  }

  const session: ReplaySession = {
    id: newCanonicalId('ReplaySession'),
    projection: projection.name,
    fromSequence: from,
    toSequence: lastSeq,
    eventsApplied: applied,
    startedAt,
    completedAt: clock(),
  };
  return { state, session };
}
