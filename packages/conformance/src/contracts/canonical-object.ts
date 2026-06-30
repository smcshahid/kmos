/**
 * Canonical object/event conformance (KMOS-0100/0110/0130/10030/10040). Any
 * object claiming to be a canonical KMOS object must carry the common structure
 * and a canonical identity; any event must be a registered, past-tense fact.
 */
import { validate, CANONICAL_OBJECT_SCHEMA, EVENT_ENVELOPE_SCHEMA, defaultEventCatalog, isCanonicalId, type CanonicalEvent } from '@kmos/canonical-kernel';
import { expect } from '../runner.js';
import type { ConformanceCheck } from '../types.js';

export function canonicalObjectContract(makeObject: () => object): ConformanceCheck[] {
  return [
    { id: 'object.common-structure', description: 'object satisfies the canonical common structure', run: () => {
      const r = validate(CANONICAL_OBJECT_SCHEMA, makeObject());
      expect(r.valid, 'common structure: ' + r.issues.map((i) => i.path + ' ' + i.message).join('; '));
    } },
    { id: 'object.canonical-identity', description: 'object id is a canonical identifier', run: () => {
      const id = (makeObject() as { id?: string }).id ?? '';
      expect(isCanonicalId(id), 'canonical id');
    } },
  ];
}

export function canonicalEventContract(makeEvent: () => CanonicalEvent): ConformanceCheck[] {
  return [
    { id: 'event.envelope', description: 'event satisfies the canonical envelope schema', run: () => {
      const r = validate(EVENT_ENVELOPE_SCHEMA, makeEvent());
      expect(r.valid, 'envelope: ' + r.issues.map((i) => i.path + ' ' + i.message).join('; '));
    } },
    { id: 'event.registered', description: 'event type is registered in the canonical catalog', run: () => {
      expect(defaultEventCatalog.has(makeEvent().identity.type), 'registered event type');
    } },
    { id: 'event.past-tense-name', description: 'event name is BusinessObject+PastTenseVerb (PascalCase)', level: 'Certified', run: () => {
      expect(/^[A-Z][A-Za-z0-9]+$/.test(makeEvent().identity.type), 'PascalCase event name');
    } },
  ];
}
