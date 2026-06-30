/**
 * Local event-catalog extension for the Search & Discovery Service (KMOS-0208 §4).
 *
 * The Search lifecycle events (IndexCreated, KnowledgeIndexed, AssetIndexed,
 * IndexRebuilt) are NOT part of the kernel seed catalog. Per KMOS-0110 / risk
 * R-02, services may not invent private event vocabularies on the shared default
 * catalog. Instead the service uses its OWN catalog instance, seeded with the
 * kernel families PLUS these Search events, and constructs its EventBus with it.
 *
 * `createSearchCatalog()` returns a fresh EventCatalog that recognises every
 * kernel-seeded event type (so the service can both consume canonical events
 * such as KnowledgeCreated/AssetRegistered AND publish its own index events on a
 * single bus). When callers inject their own bus, they should build it with a
 * catalog produced here so the service's published index events validate.
 */

import {
  EventCatalog,
  defaultEventCatalog,
  type EventTypeDefinition,
} from '@kmos/canonical-kernel';

/** The Search-owned canonical event types (local catalog extension, KMOS-0208 §4). */
export const SEARCH_EVENT_DEFINITIONS: readonly EventTypeDefinition[] = [
  { type: 'IndexCreated', owner: 'SearchService', eventClass: 'Platform', schemaVersion: '1.0', category: 'Search' },
  { type: 'KnowledgeIndexed', owner: 'SearchService', eventClass: 'Operational', schemaVersion: '1.0', category: 'Search' },
  { type: 'AssetIndexed', owner: 'SearchService', eventClass: 'Operational', schemaVersion: '1.0', category: 'Search' },
  { type: 'IndexRebuilt', owner: 'SearchService', eventClass: 'Operational', schemaVersion: '1.0', category: 'Search' },
];

/**
 * Build a catalog seeded with every kernel-default event type plus the Search
 * events. Constructing an EventBus with this catalog lets the Search service
 * consume canonical events and publish its own index events on the same bus
 * without polluting the shared default catalog.
 */
export function createSearchCatalog(): EventCatalog {
  const catalog = new EventCatalog(defaultEventCatalog.list());
  for (const def of SEARCH_EVENT_DEFINITIONS) {
    if (!catalog.has(def.type)) catalog.register(def);
  }
  return catalog;
}
