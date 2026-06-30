/**
 * Schema for the canonical event envelope (KMOS-0110 §5).
 * Used to validate every event before it enters the append-only log.
 */

import type { Schema } from './validate.js';

export const EVENT_ENVELOPE_SCHEMA: Schema = {
  type: 'object',
  required: ['identity', 'payload', 'governance'],
  additionalProperties: false,
  properties: {
    identity: {
      type: 'object',
      required: ['eventId', 'type', 'schemaVersion', 'time', 'producer', 'correlationId'],
      additionalProperties: false,
      properties: {
        eventId: { type: 'string', minLength: 1 },
        type: { type: 'string', pattern: '^[A-Z][A-Za-z0-9]+$' },
        schemaVersion: { type: 'string', pattern: '^[0-9]+\\.[0-9]+$' },
        time: { type: 'string', format: 'date-time' },
        producer: { type: 'string', minLength: 1 },
        correlationId: { type: 'string', minLength: 1 },
        causationId: { type: 'string', minLength: 1 },
        organizationId: { type: 'string', format: 'canonical-id' },
        actorId: { type: 'string', format: 'canonical-id' },
        subjectId: { type: 'string', format: 'canonical-id' },
      },
    },
    payload: { type: 'object' },
    governance: { type: 'object' },
  },
};
