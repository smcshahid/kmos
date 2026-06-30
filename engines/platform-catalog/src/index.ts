/**
 * @kmos/platform-catalog — one merged canonical Event Catalog for composed
 * (single-shared-bus) deployments. Unions the kernel seed with every platform
 * service's local catalog extension, plus domain event types. Deduped by type.
 *
 * This is a composition convenience (engines layer). The authoritative event
 * vocabulary remains the kernel + KMOS-10040; M5 should promote these into the
 * kernel seed so per-service local catalogs are no longer needed.
 */

import { EventCatalog, type EventTypeDefinition } from '@kmos/canonical-kernel';
import { createGovernanceCatalog } from '@kmos/governance';
import { createRuntimeCatalog } from '@kmos/capability-runtime';
import { createWorkflowCatalog } from '@kmos/workflow';
import { createConfigurationCatalog } from '@kmos/configuration';
import { createSearchCatalog } from '@kmos/search';

/** Canonical event types produced by domain services (M3). */
export const DOMAIN_EVENT_TYPES: readonly EventTypeDefinition[] = [
  { type: 'LectureImported', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Media' },
  { type: 'LectureProcessed', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Media' },
  { type: 'TranscriptCorrected', owner: 'WorkflowService', eventClass: 'Capability', schemaVersion: '1.0', category: 'Language' },
  { type: 'VocabularyLearned', owner: 'KnowledgeService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Language' },
  { type: 'StoryboardCompleted', owner: 'WorkflowService', eventClass: 'Capability', schemaVersion: '1.0', category: 'Media' },
  { type: 'PublicationPrepared', owner: 'WorkflowService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Publishing' },
  { type: 'PublicationMetadataGenerated', owner: 'WorkflowService', eventClass: 'Capability', schemaVersion: '1.0', category: 'Publishing' },
  { type: 'PreservationCompleted', owner: 'AssetRegistry', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Preservation' },
  { type: 'AiContributionRecorded', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'AI' },
  { type: 'ConnectorActivated', owner: 'EventService', eventClass: 'Platform', schemaVersion: '1.0', category: 'Platform' },
  { type: 'ExternalRecordIngested', owner: 'AssetRegistry', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Platform' },
];

/** Build one EventCatalog covering kernel + all platform services + domain events. */
export function createPlatformCatalog(extra: readonly EventTypeDefinition[] = []): EventCatalog {
  const byType = new Map<string, EventTypeDefinition>();
  const add = (defs: readonly EventTypeDefinition[]): void => {
    for (const d of defs) if (!byType.has(d.type)) byType.set(d.type, d);
  };
  // kernel defaults are included via each factory's list(); union them all.
  add(createGovernanceCatalog().list());
  add(createRuntimeCatalog().list());
  add(createWorkflowCatalog().list());
  add(createConfigurationCatalog().list());
  add(createSearchCatalog().list());
  add(DOMAIN_EVENT_TYPES);
  add(extra);
  return new EventCatalog([...byType.values()]);
}
