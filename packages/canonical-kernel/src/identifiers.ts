/**
 * Canonical identifiers (KMOS-0100 §6, KMOS-10030 §7/§14).
 *
 * Identity is permanent and independent of storage, filename, database, or
 * technology. A canonical identifier has the stable form:
 *
 *     kmos:<objectType>:<uuid>
 *
 * The objectType segment is purely for human/operator readability and routing
 * convenience; authority rests on the full opaque string. Identifiers MUST NOT
 * be derived from file names, database keys, storage URLs, or paths.
 */

import { randomUUID } from 'node:crypto';

export const KMOS_ID_PREFIX = 'kmos' as const;

/** A canonical object identifier, e.g. "kmos:Asset:e7c1...". */
export type CanonicalId = string;

/** A canonical event identifier (events are facts; ids are globally unique). */
export type EventId = string;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TYPE_SEGMENT_RE = /^[A-Za-z][A-Za-z0-9]*$/;

/** Create a new canonical identifier for the given canonical object type. */
export function newCanonicalId(objectType: string): CanonicalId {
  if (!TYPE_SEGMENT_RE.test(objectType)) {
    throw new Error(
      `Invalid canonical object type segment: "${objectType}" (must match ${TYPE_SEGMENT_RE}).`,
    );
  }
  return `${KMOS_ID_PREFIX}:${objectType}:${randomUUID()}`;
}

/** Create a new globally-unique event identifier. */
export function newEventId(): EventId {
  return randomUUID();
}

export interface ParsedCanonicalId {
  readonly prefix: string;
  readonly objectType: string;
  readonly uuid: string;
}

/** Parse a canonical identifier into its parts, or return undefined if invalid. */
export function parseCanonicalId(id: string): ParsedCanonicalId | undefined {
  const parts = id.split(':');
  if (parts.length !== 3) return undefined;
  const [prefix, objectType, uuid] = parts as [string, string, string];
  if (prefix !== KMOS_ID_PREFIX) return undefined;
  if (!TYPE_SEGMENT_RE.test(objectType)) return undefined;
  if (!UUID_RE.test(uuid)) return undefined;
  return { prefix, objectType, uuid };
}

/** True if the string is a structurally valid canonical identifier. */
export function isCanonicalId(id: string): boolean {
  return parseCanonicalId(id) !== undefined;
}

/** Extract the object type from a canonical id, or undefined if invalid. */
export function objectTypeOf(id: string): string | undefined {
  return parseCanonicalId(id)?.objectType;
}
