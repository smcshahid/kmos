/**
 * Local event catalog for Configuration Service events (KMOS-0209 §4).
 *
 * The Configuration event family is not yet part of the kernel seed
 * (KMOS-10040). Until it is promoted via governance review, the service runs its
 * own EventCatalog: the kernel seed plus the four Configuration event types.
 * This keeps services from inventing private vocabularies ad hoc while still
 * allowing this draft service to publish through the validated kernel bus.
 */

import { EventCatalog, defaultEventCatalog, type EventTypeDefinition } from '@kmos/canonical-kernel';

/** The Configuration Service event types (registered locally, pending KMOS-10040). */
export const CONFIGURATION_EVENT_TYPES: readonly EventTypeDefinition[] = [
  { type: 'ConfigurationRegistered', owner: 'ConfigurationService', eventClass: 'Platform', schemaVersion: '1.0', category: 'Configuration' },
  { type: 'ConfigurationUpdated', owner: 'ConfigurationService', eventClass: 'Platform', schemaVersion: '1.0', category: 'Configuration' },
  { type: 'ConfigurationProfileChanged', owner: 'ConfigurationService', eventClass: 'Platform', schemaVersion: '1.0', category: 'Configuration' },
  { type: 'SecretReferenced', owner: 'ConfigurationService', eventClass: 'Platform', schemaVersion: '1.0', category: 'Configuration' },
];

/**
 * Build an EventCatalog seeded with the kernel's canonical event families plus
 * the Configuration Service event types. A fresh catalog is returned each call.
 */
export function createConfigurationCatalog(): EventCatalog {
  const catalog = new EventCatalog(defaultEventCatalog.list());
  for (const def of CONFIGURATION_EVENT_TYPES) if (!catalog.has(def.type)) catalog.register(def);
  return catalog;
}
