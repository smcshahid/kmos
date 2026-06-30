/**
 * Event schema registry (KMOS-0203 §12, KMOS-0110 §10/§14).
 *
 * Owns EventSchema canonical objects and enforces compatibility when an event
 * type evolves. Default policy is BACKWARD (Readiness Report §7.1): a new schema
 * version may add optional fields and remove fields, but may not add new
 * required fields or change the type of an existing field. Breaking changes must
 * be published as a NEW event type/version, never an in-place mutation.
 */

import {
  createCanonicalObject,
  newCanonicalId,
  type CanonicalObject,
  type Schema,
} from '@kmos/canonical-kernel';

export type CompatibilityMode = 'BACKWARD' | 'NONE';

export interface EventSchemaBody {
  readonly eventType: string;
  readonly version: string; // e.g. "1.0"
  readonly schema: Schema;
  readonly compatibility: CompatibilityMode;
}

export type EventSchemaObject = CanonicalObject<EventSchemaBody>;

export interface CompatibilityResult {
  readonly compatible: boolean;
  readonly reasons: readonly string[];
}

/** Check BACKWARD compatibility of `next` against `prev`. */
export function checkBackwardCompatible(prev: Schema, next: Schema): CompatibilityResult {
  const reasons: string[] = [];
  const prevProps = prev.properties ?? {};
  const nextProps = next.properties ?? {};
  const prevRequired = new Set(prev.required ?? []);
  const nextRequired = new Set(next.required ?? []);

  // New required fields not previously required would break old data.
  for (const r of nextRequired) {
    if (!prevRequired.has(r)) reasons.push(`added required field "${r}"`);
  }
  // Changing the declared type of an existing property breaks readers.
  for (const [key, nextSub] of Object.entries(nextProps)) {
    const prevSub = prevProps[key];
    if (prevSub && prevSub.type && nextSub.type && prevSub.type !== nextSub.type) {
      reasons.push(`changed type of "${key}" (${prevSub.type} -> ${nextSub.type})`);
    }
  }
  return { compatible: reasons.length === 0, reasons };
}

export class SchemaRegistry {
  /** eventType -> ordered versions (latest last). */
  private readonly byType = new Map<string, EventSchemaObject[]>();

  /** Register a new schema version for an event type, enforcing compatibility. */
  register(body: EventSchemaBody, now?: string): EventSchemaObject {
    const existing = this.byType.get(body.eventType) ?? [];
    const latest = existing[existing.length - 1];
    if (latest && body.compatibility === 'BACKWARD') {
      const res = checkBackwardCompatible(latest.body.schema, body.schema);
      if (!res.compatible) {
        throw new Error(
          `Schema for ${body.eventType} v${body.version} is not BACKWARD compatible: ${res.reasons.join('; ')}`,
        );
      }
    }
    if (latest && latest.body.version === body.version) {
      throw new Error(`Schema version already registered: ${body.eventType} v${body.version}`);
    }
    const obj = createCanonicalObject<EventSchemaBody>({
      id: newCanonicalId('EventSchema'),
      type: 'EventSchema',
      schemaVersion: '1.0',
      owner: 'EventService',
      lifecycle: 'Active',
      displayName: `${body.eventType}@${body.version}`,
      body,
      ...(now !== undefined ? { now } : {}),
    });
    existing.push(obj);
    this.byType.set(body.eventType, existing);
    return obj;
  }

  latest(eventType: string): EventSchemaObject | undefined {
    const versions = this.byType.get(eventType);
    return versions?.[versions.length - 1];
  }

  versions(eventType: string): readonly EventSchemaObject[] {
    return this.byType.get(eventType) ?? [];
  }

  has(eventType: string): boolean {
    return this.byType.has(eventType);
  }

  /** Number of distinct event types with at least one registered schema. */
  size(): number {
    return this.byType.size;
  }
}
