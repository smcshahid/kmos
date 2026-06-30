/**
 * In-memory append-only event log (KMOS-0203).
 *
 * This is the modular-monolith-first implementation behind the EventLog port.
 * It models the production Postgres design (Readiness Report §7.1): per-stream
 * version with optimistic concurrency (UNIQUE(stream_id, version)) plus a
 * monotonic global sequence used for ordered replay.
 *
 * NOTE (certification CRIT-1): the in-process port is intentionally SYNCHRONOUS
 * for the modular-monolith phase so the existing consumers and tests remain
 * straightforward. The production storage contract is the asynchronous
 * `AsyncEventLog` (see platform/events/src/infrastructure/postgres-event-log.ts),
 * which a real database implements. Converging the in-process port onto the
 * async contract is a tracked, CI-guarded migration (see review CRIT-1).
 *
 * History is immutable and append-only: events are never updated or deleted.
 */

import { KmosError } from '../errors.js';
import type { CanonicalEvent } from '../event-envelope.js';

/** A persisted event = the canonical event plus storage-assigned positions. */
export interface StoredEvent<P extends object = object> {
  readonly sequence: number;
  readonly streamId: string;
  readonly streamVersion: number;
  readonly event: CanonicalEvent<P>;
}

export interface AppendOptions {
  readonly expectedVersion?: number;
}

export interface EventLog {
  append(streamId: string, event: CanonicalEvent, options?: AppendOptions): StoredEvent;
  currentVersion(streamId: string): number;
  read(fromSequence?: number): readonly StoredEvent[];
  readStream(streamId: string): readonly StoredEvent[];
  size(): number;
}

export class InMemoryEventLog implements EventLog {
  private readonly all: StoredEvent[] = [];
  private readonly streamVersions = new Map<string, number>();

  append(streamId: string, event: CanonicalEvent, options?: AppendOptions): StoredEvent {
    const current = this.streamVersions.get(streamId) ?? 0;
    if (options?.expectedVersion !== undefined && options.expectedVersion !== current) {
      throw new KmosError('Optimistic concurrency conflict on stream append', {
        category: 'Conflict',
        code: 'event.stream.version_conflict',
        subject: streamId,
        detail: { expected: options.expectedVersion, actual: current },
      });
    }
    const streamVersion = current + 1;
    const stored: StoredEvent = { sequence: this.all.length + 1, streamId, streamVersion, event };
    this.all.push(stored);
    this.streamVersions.set(streamId, streamVersion);
    return stored;
  }

  currentVersion(streamId: string): number {
    return this.streamVersions.get(streamId) ?? 0;
  }

  read(fromSequence = 1): readonly StoredEvent[] {
    return this.all.slice(Math.max(0, fromSequence - 1));
  }

  readStream(streamId: string): readonly StoredEvent[] {
    return this.all.filter((s) => s.streamId === streamId);
  }

  size(): number {
    return this.all.length;
  }
}
