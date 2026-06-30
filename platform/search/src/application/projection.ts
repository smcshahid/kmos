/**
 * The Search projection (KMOS-0208 §3; KMOS-0110 event-driven projections).
 *
 * A pure mapping from a canonical event to an IndexedDocument body. The same
 * mapping is used for live event-driven indexing AND for rebuild-by-replay, so
 * an index built incrementally is byte-for-byte identical to one rebuilt from
 * the log (constitution §6, determinism). This module contains no IO.
 */

import {
  createCanonicalObject,
  newCanonicalId,
  type CanonicalId,
  type CanonicalObject,
  type SecurityClassification,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import type {
  IndexedDocument,
  IndexedDocumentBody,
  IndexedFields,
} from '../domain/model.js';

/** Canonical event types the Search service indexes (KMOS-0208 §3). */
export const INDEXED_EVENT_TYPES: readonly string[] = [
  'KnowledgeCreated',
  'ConceptCreated',
  'AssetRegistered',
  'CapabilityRegistered',
];

/** Map an indexed event type to the canonical object type it represents. */
function objectTypeFor(eventType: string): string {
  switch (eventType) {
    case 'KnowledgeCreated':
      return 'KnowledgeObject';
    case 'ConceptCreated':
      return 'Concept';
    case 'AssetRegistered':
      return 'Asset';
    case 'CapabilityRegistered':
      return 'Capability';
    default:
      return eventType;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Extract the identifying fields present in an event payload (KMOS-0208 §3). */
export function extractFields(stored: StoredEvent): IndexedFields {
  const payload = stored.event.payload as Record<string, unknown>;
  const identity = stored.event.identity;
  const governance = stored.event.governance;

  const organizationId =
    asString(payload['organizationId']) ?? (identity.organizationId as CanonicalId | undefined);
  const classification =
    (asString(payload['classification']) as SecurityClassification | undefined) ??
    (governance.securityClassification as SecurityClassification | undefined);

  const fields: IndexedFields = {
    ...((asString(payload['name']) ?? asString(payload['canonicalName']) ?? asString(payload['title'])) !== undefined
      ? { name: asString(payload['name']) ?? asString(payload['canonicalName']) ?? asString(payload['title']) }
      : {}),
    ...(asString(payload['displayName']) !== undefined
      ? { displayName: asString(payload['displayName']) }
      : {}),
    objectType: asString(payload['type']) ?? objectTypeFor(identity.type),
    ...(organizationId !== undefined ? { organizationId } : {}),
    tags: asStringArray(payload['tags']),
    ...(classification !== undefined ? { classification } : {}),
  };
  return fields;
}

/** Assemble the free-text searchable content from the extracted fields. */
export function buildText(fields: IndexedFields): string {
  const parts: string[] = [];
  if (fields.name) parts.push(fields.name);
  if (fields.displayName) parts.push(fields.displayName);
  if (fields.objectType) parts.push(fields.objectType);
  parts.push(...fields.tags);
  return parts.join(' ');
}

/**
 * Build the projection body for a stored event. The vector is supplied by the
 * caller (it comes from the injected Embedder port, kept out of this pure core).
 */
export function projectBody(stored: StoredEvent, vector: readonly number[]): IndexedDocumentBody {
  const fields = extractFields(stored);
  const subjectId = (stored.event.identity.subjectId ?? stored.event.identity.eventId) as CanonicalId;
  return {
    subjectId,
    sourceEventType: stored.event.identity.type,
    fields,
    text: buildText(fields),
    vector,
  };
}

/**
 * Build an IndexedDocument canonical object for a stored event. The document id
 * is DERIVED DETERMINISTICALLY from the subject id (kmos:IndexedDocument:<uuid
 * of subject>) so re-indexing the same subject upserts the same document rather
 * than duplicating (KMOS-0208 §3 idempotency).
 */
export function projectDocument(
  stored: StoredEvent,
  vector: readonly number[],
  now: string,
): IndexedDocument {
  const body = projectBody(stored, vector);
  const docId = indexedDocumentId(body.subjectId);
  const obj: CanonicalObject<IndexedDocumentBody> = createCanonicalObject<IndexedDocumentBody>({
    id: docId,
    type: 'IndexedDocument',
    schemaVersion: '1.0',
    owner: 'SearchService',
    lifecycle: 'Active',
    ...(body.fields.displayName ?? body.fields.name
      ? { displayName: body.fields.displayName ?? body.fields.name }
      : {}),
    ...(body.fields.organizationId !== undefined
      ? { organizationId: body.fields.organizationId }
      : {}),
    governance: {
      ...(body.fields.classification !== undefined
        ? { securityClassification: body.fields.classification }
        : {}),
    },
    body,
    now,
  });
  return obj;
}

/** Deterministic IndexedDocument id derived from the subject id (stable upsert key). */
export function indexedDocumentId(subjectId: CanonicalId): CanonicalId {
  const uuid = subjectId.split(':')[2];
  // Reuse the subject's uuid when available so the doc id is stable per subject.
  if (uuid && /^[0-9a-f-]{36}$/i.test(uuid)) return `kmos:IndexedDocument:${uuid}`;
  return newCanonicalId('IndexedDocument');
}
