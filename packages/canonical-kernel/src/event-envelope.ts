/**
 * Canonical event envelope (KMOS-0110 §5, KMOS-10040 §5).
 *
 * An event represents something that has ALREADY happened. Events are facts, not
 * commands; immutable; versioned; replayable. The envelope has three logical
 * sections: Identity, Business Payload, Governance Metadata.
 *
 * The Identity section carries the correlation/causation triplet (Greg Young):
 *   - eventId       : this event's unique id
 *   - correlationId : groups a whole business transaction; copied from the
 *                     triggering event, or defaults to this event's id when root
 *   - causationId   : the id of the event/command that directly caused this one
 *
 * The naming convention for `type` is BusinessObject + PastTenseVerb
 * (e.g. "AssetRegistered"), enforced by the event catalog (event-catalog.ts).
 */

import { newEventId, type CanonicalId, type EventId } from './identifiers.js';

/** Event class (KMOS-10040 §4). Operational events MUST NOT become institutional history. */
export const EVENT_CLASSES = ['Institutional', 'Platform', 'Capability', 'Operational'] as const;
export type EventClass = (typeof EVENT_CLASSES)[number];

export interface EventIdentity {
  readonly eventId: EventId;
  readonly type: string; // canonical event name, e.g. "AssetRegistered"
  readonly schemaVersion: string; // e.g. "1.0"
  readonly time: string; // ISO-8601, when the fact occurred
  readonly producer: string; // producing service or capability id
  readonly correlationId: EventId;
  readonly causationId?: EventId;
  readonly organizationId?: CanonicalId; // tenant
  readonly actorId?: CanonicalId; // identity on whose authority the fact occurred
  /** Canonical subject this event is about (e.g. the Asset id). */
  readonly subjectId?: CanonicalId;
}

export interface EventGovernance {
  readonly workflowId?: CanonicalId;
  readonly executionId?: CanonicalId;
  readonly capabilityId?: CanonicalId;
  readonly relatedAssets?: readonly CanonicalId[];
  readonly relatedKnowledge?: readonly CanonicalId[];
  readonly approvalStatus?: string;
  readonly securityClassification?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
  readonly lineageRefs?: readonly CanonicalId[];
}

/**
 * A canonical event. `P` is the event-type-specific business payload, which MUST
 * reference canonical identifiers only and MUST NOT contain infrastructure
 * metadata (KMOS-0110 §5).
 */
export interface CanonicalEvent<P extends object = Record<string, unknown>> {
  readonly identity: EventIdentity;
  readonly payload: P;
  readonly governance: EventGovernance;
}

export interface NewEventInput<P extends object> {
  readonly type: string;
  readonly schemaVersion: string;
  readonly producer: string;
  readonly payload: P;
  readonly subjectId?: CanonicalId;
  readonly organizationId?: CanonicalId;
  readonly actorId?: CanonicalId;
  readonly governance?: EventGovernance;
  /**
   * The event being reacted to, if any. When provided, correlationId is
   * inherited and causationId is set to its eventId (Greg Young rules).
   */
  readonly causedBy?: CanonicalEvent;
  /** Override time/id for deterministic construction (replay/tests). */
  readonly time?: string;
  readonly eventId?: EventId;
}

/** Construct a canonical event, applying correlation/causation rules. */
export function createEvent<P extends object>(input: NewEventInput<P>): CanonicalEvent<P> {
  const eventId = input.eventId ?? newEventId();
  const correlationId = input.causedBy?.identity.correlationId ?? eventId;
  const identity: EventIdentity = {
    eventId,
    type: input.type,
    schemaVersion: input.schemaVersion,
    time: input.time ?? new Date().toISOString(),
    producer: input.producer,
    correlationId,
    ...(input.causedBy !== undefined ? { causationId: input.causedBy.identity.eventId } : {}),
    ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    ...(input.actorId !== undefined ? { actorId: input.actorId } : {}),
    ...(input.subjectId !== undefined ? { subjectId: input.subjectId } : {}),
  };
  return {
    identity,
    payload: input.payload,
    governance: input.governance ?? {},
  };
}
