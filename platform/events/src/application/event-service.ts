/**
 * Event Service application layer (KMOS-0203).
 *
 * The institutional communication engine. Wraps the canonical kernel's event
 * bus, append-only log, and replay engine, and adds the service responsibilities
 * the kernel does not: an EventSchema registry with compatibility, governed
 * subscriptions (pause/resume), correlation/causation queries, replay sessions,
 * dead-letter access, and metrics. Exposes business APIs (KMOS-0203 §8) and
 * remains transport/broker independent.
 */

import {
  EventBus,
  createEvent,
  type CanonicalEvent,
  type EventHandler,
  type StoredEvent,
  type EventId,
  type DeadLetter,
  type Projection,
  type ReplayResult,
  type Schema,
  replay,
  validate,
} from '@kmos/canonical-kernel';
import {
  SchemaRegistry,
  type CompatibilityMode,
  type EventSchemaObject,
} from '../domain/schema-registry.js';
import { SubscriptionRegistry, type SubscriptionObject } from '../domain/subscriptions.js';

export interface EventServiceOptions {
  readonly bus?: EventBus;
  /** Deterministic clock for service-emitted lifecycle events (tests/replay). */
  readonly now?: () => string;
}

export interface RegisterSchemaInput {
  readonly eventType: string;
  readonly version: string;
  readonly schema: Schema;
  readonly compatibility?: CompatibilityMode;
}

export interface PublishInput<P extends object = Record<string, unknown>> {
  readonly event: CanonicalEvent<P>;
  readonly streamId?: string;
  readonly expectedVersion?: number;
}

export interface EventMetrics {
  readonly totalEvents: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly subscriptions: number;
  readonly deadLetters: number;
  readonly schemas: number;
}

export class EventService {
  private readonly bus: EventBus;
  private readonly schemas = new SchemaRegistry();
  private readonly subs = new SubscriptionRegistry();
  private readonly now: () => string;

  constructor(options: EventServiceOptions = {}) {
    this.bus = options.bus ?? new EventBus();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** Underlying bus (for advanced/inter-service wiring within the monolith). */
  get eventBus(): EventBus {
    return this.bus;
  }

  // --- Schema APIs (KMOS-0203 §8) ---

  registerEventSchema(input: RegisterSchemaInput): EventSchemaObject {
    const obj = this.schemas.register(
      {
        eventType: input.eventType,
        version: input.version,
        schema: input.schema,
        compatibility: input.compatibility ?? 'BACKWARD',
      },
      this.now(),
    );
    void this.emitLifecycle('SchemaRegistered', { eventType: input.eventType, version: input.version });
    return obj;
  }

  /** Validate an event's payload against its registered schema (if any) + envelope/catalog. */
  validateEvent(event: CanonicalEvent): void {
    this.bus.validateEvent(event); // envelope + catalog (throws on failure)
    const latest = this.schemas.latest(event.identity.type);
    if (latest) {
      // Additionally check the registered payload schema for this event type.
      const res = validate(latest.body.schema, event.payload);
      if (!res.valid) {
        throw new Error(
          `Payload failed schema ${event.identity.type}@${latest.body.version}: ` +
            res.issues.map((i) => `${i.path}: ${i.message}`).join('; '),
        );
      }
    }
  }

  // --- Publish / read APIs ---

  async publishEvent<P extends object>(input: PublishInput<P>): Promise<StoredEvent<P>> {
    const opts: { streamId?: string; expectedVersion?: number } = {};
    if (input.streamId !== undefined) opts.streamId = input.streamId;
    if (input.expectedVersion !== undefined) opts.expectedVersion = input.expectedVersion;
    return (await this.bus.publish(input.event, opts)) as StoredEvent<P>;
  }

  getEvent(eventId: EventId): StoredEvent | undefined {
    return this.bus.eventLog.read(1).find((s) => s.event.identity.eventId === eventId);
  }

  getEventHistory(streamId: string): readonly StoredEvent[] {
    return this.bus.eventLog.readStream(streamId);
  }

  // --- Correlation & causation (KMOS-0203 §15/§16) ---

  getCorrelationChain(correlationId: EventId): readonly StoredEvent[] {
    return this.bus.eventLog.read(1).filter((s) => s.event.identity.correlationId === correlationId);
  }

  /** Walk the causation chain backwards from an event to its root cause. */
  getCausationChain(eventId: EventId): readonly StoredEvent[] {
    const all = this.bus.eventLog.read(1);
    const byId = new Map(all.map((s) => [s.event.identity.eventId, s] as const));
    const chain: StoredEvent[] = [];
    let current = byId.get(eventId);
    const guard = new Set<string>();
    while (current && !guard.has(current.event.identity.eventId)) {
      guard.add(current.event.identity.eventId);
      chain.push(current);
      const causedBy = current.event.identity.causationId;
      current = causedBy ? byId.get(causedBy) : undefined;
    }
    return chain.reverse();
  }

  // --- Subscriptions (KMOS-0203 §17) ---

  createSubscription(subscriber: string, eventTypes: readonly string[], handler: EventHandler): SubscriptionObject {
    const obj = this.subs.create(subscriber, eventTypes, this.now());
    // Wrap so paused subscriptions skip delivery (idempotency handled by the bus).
    this.bus.subscribe({
      subscriber,
      eventTypes,
      handler: async (stored: StoredEvent) => {
        if (!this.subs.isActive(subscriber)) return;
        await handler(stored);
      },
    });
    void this.emitLifecycle('SubscriptionCreated', { subscriber });
    return obj;
  }

  pauseSubscription(subscriber: string): SubscriptionObject {
    return this.subs.pause(subscriber);
  }

  resumeSubscription(subscriber: string): SubscriptionObject {
    return this.subs.resume(subscriber);
  }

  // --- Replay (KMOS-0203 §14) ---

  async replayEvents<S>(projection: Projection<S>, fromSequence = 1): Promise<ReplayResult<S>> {
    await this.emitLifecycle('ReplayStarted', { projection: projection.name, fromSequence });
    const result = replay(this.bus.eventLog, projection, { fromSequence, now: this.now });
    await this.emitLifecycle('ReplayCompleted', {
      projection: projection.name,
      eventsApplied: result.session.eventsApplied,
    });
    return result;
  }

  // --- Dead letters & metrics ---

  getDeadLetterQueue(): readonly DeadLetter[] {
    return this.bus.getDeadLetters();
  }

  getEventMetrics(): EventMetrics {
    const all = this.bus.eventLog.read(1);
    const byType: Record<string, number> = {};
    for (const s of all) byType[s.event.identity.type] = (byType[s.event.identity.type] ?? 0) + 1;
    return {
      totalEvents: all.length,
      byType,
      subscriptions: this.subs.list().length,
      deadLetters: this.bus.getDeadLetters().length,
      schemas: this.schemas.size(),
    };
  }

  // --- Internal lifecycle emission ---

  private async emitLifecycle(type: string, payload: Record<string, unknown>): Promise<void> {
    const ev = createEvent({
      type,
      schemaVersion: '1.0',
      producer: 'EventService',
      payload,
      time: this.now(),
    });
    await this.bus.publish(ev);
  }
}
