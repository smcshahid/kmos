/**
 * In-memory append-only event log (KMOS-0203).
 *
 * This is the modular-monolith-first implementation behind the EventLog port.
 * It models the production Postgres design (Readiness Report §7.1): per-stream
 * version with optimistic concurrency (UNIQUE(stream_id, version)) plus a
 * monotonic global sequence used for ordered replay.
 *
 * CRIT-1 (resolved, KEP-001): the EventLog port is ASYNCHRONOUS. One port, two
 * adapters: this `InMemoryEventLog` (modular-monolith-first) and the real
 * `PostgresEventLog` (platform/events) both implement the *same* async port, so
 * the authoritative contract is database-satisfiable. `EventBus.publish` awaits
 * the append; `replay()` awaits `read()`. The await-everywhere publication
 * contract (KEP-D1) makes in-process semantics identical to real async storage —
 * fire-and-forget emission is prohibited and enforced by a fitness rule.
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
  append(streamId: string, event: CanonicalEvent, options?: AppendOptions): Promise<StoredEvent>;
  currentVersion(streamId: string): Promise<number>;
  read(fromSequence?: number): Promise<readonly StoredEvent[]>;
  readStream(streamId: string): Promise<readonly StoredEvent[]>;
  size(): Promise<number>;
}

export class InMemoryEventLog implements EventLog {
  private readonly all: StoredEvent[] = [];
  private readonly streamVersions = new Map<string, number>();

  async append(streamId: string, event: CanonicalEvent, options?: AppendOptions): Promise<StoredEvent> {
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

  async currentVersion(streamId: string): Promise<number> {
    return this.streamVersions.get(streamId) ?? 0;
  }

  async read(fromSequence = 1): Promise<readonly StoredEvent[]> {
    return this.all.slice(Math.max(0, fromSequence - 1));
  }

  async readStream(streamId: string): Promise<readonly StoredEvent[]> {
    return this.all.filter((s) => s.streamId === streamId);
  }

  async size(): Promise<number> {
    return this.all.length;
  }
}
