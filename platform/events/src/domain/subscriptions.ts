/**
 * Subscription management (KMOS-0203 §17).
 *
 * Subscriptions are canonical objects describing consumers of canonical events.
 * They may filter by event type and may be paused/resumed; a paused subscription
 * stops receiving deliveries without losing its position (it can replay later).
 */

import {
  createCanonicalObject,
  newCanonicalId,
  type CanonicalObject,
} from '@kmos/canonical-kernel';

export type SubscriptionState = 'Active' | 'Paused';

export interface SubscriptionBody {
  readonly subscriber: string;
  readonly eventTypes: readonly string[]; // '*' for all
  readonly state: SubscriptionState;
}

export type SubscriptionObject = CanonicalObject<SubscriptionBody>;

export class SubscriptionRegistry {
  private readonly bySubscriber = new Map<string, SubscriptionObject>();

  create(subscriber: string, eventTypes: readonly string[], now?: string): SubscriptionObject {
    if (this.bySubscriber.has(subscriber)) {
      throw new Error(`Subscription already exists: ${subscriber}`);
    }
    const obj = createCanonicalObject<SubscriptionBody>({
      id: newCanonicalId('Subscription'),
      type: 'Subscription',
      schemaVersion: '1.0',
      owner: 'EventService',
      lifecycle: 'Active',
      displayName: subscriber,
      body: { subscriber, eventTypes, state: 'Active' },
      ...(now !== undefined ? { now } : {}),
    });
    this.bySubscriber.set(subscriber, obj);
    return obj;
  }

  private setState(subscriber: string, state: SubscriptionState): SubscriptionObject {
    const current = this.bySubscriber.get(subscriber);
    if (!current) throw new Error(`No such subscription: ${subscriber}`);
    const updated: SubscriptionObject = {
      ...current,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      body: { ...current.body, state },
    };
    this.bySubscriber.set(subscriber, updated);
    return updated;
  }

  pause(subscriber: string): SubscriptionObject {
    return this.setState(subscriber, 'Paused');
  }

  resume(subscriber: string): SubscriptionObject {
    return this.setState(subscriber, 'Active');
  }

  isActive(subscriber: string): boolean {
    return this.bySubscriber.get(subscriber)?.body.state === 'Active';
  }

  get(subscriber: string): SubscriptionObject | undefined {
    return this.bySubscriber.get(subscriber);
  }

  list(): readonly SubscriptionObject[] {
    return [...this.bySubscriber.values()];
  }
}
