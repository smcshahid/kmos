/**
 * In-process canonical event bus (KMOS-0203, modular-monolith-first).
 *
 * Responsibilities realized here:
 *  - validate every event against the envelope schema + event catalog BEFORE it
 *    enters the append-only log (KMOS-0110 §13: invalid events are never published)
 *  - persist to the append-only log (immutable history)
 *  - dispatch to subscribers (publish/subscribe, fan-out)
 *  - idempotent consumers: each subscriber processes a given eventId at most once
 *    (at-least-once delivery + idempotency, Readiness Report §7.1)
 *  - failed handlers are recorded as dead-letters, never silently dropped
 *
 * The broker stays behind this interface: a NATS/Kafka adapter can replace the
 * in-process dispatcher without changing publishers or subscribers.
 */

import { KmosError } from '../errors.js';
import type { CanonicalEvent } from '../event-envelope.js';
import { validate } from '../schema/validate.js';
import { EVENT_ENVELOPE_SCHEMA } from '../schema/envelope-schema.js';
import { defaultEventCatalog, EventCatalog } from '../schema/event-catalog.js';
import { InMemoryEventLog, type EventLog, type StoredEvent } from './append-log.js';
import { ALLOW_ALL, attributeFromContext, type Authorizer } from '../security.js';

export type EventHandler = (stored: StoredEvent) => void | Promise<void>;

export interface Subscription {
  /** Stable subscriber name; used for idempotency bookkeeping. */
  readonly subscriber: string;
  /** Event types this subscription is interested in; '*' matches all. */
  readonly eventTypes: readonly string[];
  readonly handler: EventHandler;
}

export interface DeadLetter {
  readonly subscriber: string;
  readonly stored: StoredEvent;
  readonly error: string;
  readonly attempts: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

export interface PublishOptions {
  /** Stream/aggregate id for ordering. Defaults to the event subjectId or eventId. */
  readonly streamId?: string;
  readonly expectedVersion?: number;
}

export interface EventBusOptions {
  readonly log?: EventLog;
  readonly catalog?: EventCatalog;
  /** Max delivery attempts per subscriber before dead-lettering (default 3). */
  readonly maxAttempts?: number;
  /**
   * Authorization enforcement (remediation CRIT-2). When `requireActor` is true,
   * every published event MUST carry an `actorId` (attribution) or publication
   * is rejected. When an `authorizer` is supplied, it is consulted (PDP) and a
   * denial rejects publication. Defaults: requireActor=false, authorizer=ALLOW_ALL
   * (non-enforcing), so existing deployments are unaffected; production
   * composition enables enforcing mode.
   */
  readonly authorizer?: Authorizer;
  readonly requireActor?: boolean;
}

export class EventBus {
  private readonly log: EventLog;
  private readonly catalog: EventCatalog;
  private readonly maxAttempts: number;
  private readonly authorizer: Authorizer;
  private readonly requireActor: boolean;
  private readonly subscriptions: Subscription[] = [];
  /** subscriber -> set of processed eventIds (idempotency / dedup). */
  private readonly processed = new Map<string, Set<string>>();
  private readonly deadLetters: DeadLetter[] = [];

  constructor(options: EventBusOptions = {}) {
    this.log = options.log ?? new InMemoryEventLog();
    this.catalog = options.catalog ?? defaultEventCatalog;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.authorizer = options.authorizer ?? ALLOW_ALL;
    this.requireActor = options.requireActor ?? false;
  }

  get eventLog(): EventLog {
    return this.log;
  }

  subscribe(sub: Subscription): void {
    this.subscriptions.push(sub);
    if (!this.processed.has(sub.subscriber)) this.processed.set(sub.subscriber, new Set());
  }

  /** Validate an event against the envelope schema and the event catalog. */
  validateEvent(event: CanonicalEvent): void {
    const result = validate(EVENT_ENVELOPE_SCHEMA, event);
    if (!result.valid) {
      throw new KmosError('Event failed envelope validation', {
        category: 'Validation',
        code: 'event.envelope.invalid',
        subject: event.identity.eventId,
        detail: { issues: result.issues },
      });
    }
    const def = this.catalog.get(event.identity.type);
    if (def === undefined) {
      throw new KmosError(`Unregistered canonical event type: ${event.identity.type}`, {
        category: 'Validation',
        code: 'event.type.unregistered',
        subject: event.identity.eventId,
        detail: { type: event.identity.type },
      });
    }
    if (def.schemaVersion !== event.identity.schemaVersion) {
      throw new KmosError('Event schema version does not match catalog', {
        category: 'Validation',
        code: 'event.schema.version_mismatch',
        subject: event.identity.eventId,
        detail: { expected: def.schemaVersion, actual: event.identity.schemaVersion },
      });
    }
  }

  /** Validate, persist to the append-only log, then dispatch to subscribers. */
  async publish(event: CanonicalEvent, options: PublishOptions = {}): Promise<StoredEvent> {
    // Stamp attribution from the ambient CallContext (CRIT-2) before validation
    // and enforcement, so the persisted fact carries its acting actor/tenant.
    const attributed = attributeFromContext(event);
    this.validateEvent(attributed);
    this.enforce(attributed);
    const streamId = options.streamId ?? attributed.identity.subjectId ?? attributed.identity.eventId;
    const stored = await this.log.append(streamId, attributed, options.expectedVersion === undefined ? undefined : { expectedVersion: options.expectedVersion });
    await this.dispatch(stored);
    return stored;
  }

  /**
   * Enforce attribution + authorization at the canonical chokepoint (CRIT-2).
   * No-op unless the bus was constructed in enforcing mode.
   */
  private enforce(event: CanonicalEvent): void {
    if (this.requireActor && !event.identity.actorId) {
      throw new KmosError('Unattributed event rejected: actorId required', {
        category: 'Authorization',
        code: 'event.actor.required',
        subject: event.identity.eventId,
        detail: { type: event.identity.type },
      });
    }
    const decision = this.authorizer.authorize(event);
    if (!decision.allowed) {
      throw new KmosError(`Event publication denied by policy: ${decision.reason ?? 'not authorized'}`, {
        category: 'Authorization',
        code: 'event.authorization.denied',
        subject: event.identity.eventId,
        detail: { type: event.identity.type, reason: decision.reason },
      });
    }
  }

  private matches(sub: Subscription, type: string): boolean {
    return sub.eventTypes.includes('*') || sub.eventTypes.includes(type);
  }

  private async dispatch(stored: StoredEvent): Promise<void> {
    for (const sub of this.subscriptions) {
      if (!this.matches(sub, stored.event.identity.type)) continue;
      await this.deliver(sub, stored);
    }
  }

  /** Deliver to one subscriber with idempotency + bounded retry + dead-letter. */
  private async deliver(sub: Subscription, stored: StoredEvent): Promise<void> {
    const seen = this.processed.get(sub.subscriber)!;
    const eventId = stored.event.identity.eventId;
    if (seen.has(eventId)) return; // idempotent: already processed

    let attempts = 0;
    let lastError: unknown;
    while (attempts < this.maxAttempts) {
      attempts += 1;
      try {
        await sub.handler(stored);
        seen.add(eventId); // record only after success
        return;
      } catch (err) {
        lastError = err;
        // Non-retryable failures dead-letter immediately.
        if (err instanceof KmosError && !err.retryable) break;
      }
    }
    const now = new Date().toISOString();
    this.deadLetters.push({
      subscriber: sub.subscriber,
      stored,
      error: lastError instanceof Error ? lastError.message : String(lastError),
      attempts,
      firstSeen: now,
      lastSeen: now,
    });
  }

  /** Replay-friendly: deliver an already-stored event to subscribers (no re-append). */
  async redeliver(stored: StoredEvent): Promise<void> {
    await this.dispatch(stored);
  }

  getDeadLetters(): readonly DeadLetter[] {
    return [...this.deadLetters];
  }

  /** Whether a subscriber has already processed a given event id. */
  hasProcessed(subscriber: string, eventId: string): boolean {
    return this.processed.get(subscriber)?.has(eventId) ?? false;
  }
}
