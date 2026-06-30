/**
 * Composition root: wires the whole KMOS platform on ONE shared canonical event
 * bus and returns the services/domains/applications the HTTP server exposes.
 * This is the in-process modular-monolith composition (KMOS-0200 §17); the same
 * wiring runs behind real persistence/transport adapters in production.
 */
import { EventBus } from '@kmos/canonical-kernel';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { IdentityService } from '@kmos/identity';
import { AssetRegistryService } from '@kmos/assets';
import { KnowledgeService } from '@kmos/knowledge';
import { GovernanceService } from '@kmos/governance';
import { EventService } from '@kmos/events';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { SearchService } from '@kmos/search';
import { MediaDomainService } from '@kmos/media';
import { LanguageDomainService } from '@kmos/language';
import { PublishingDomainService } from '@kmos/publishing';
import { PreservationDomainService } from '@kmos/preservation';
import { KnowledgeStudio } from '@kmos/knowledge-studio';
import { ArchiveExplorer } from '@kmos/archive-explorer';

export interface KmosPlatform {
  readonly bus: EventBus;
  readonly identity: IdentityService;
  readonly assets: AssetRegistryService;
  readonly knowledge: KnowledgeService;
  readonly governance: GovernanceService;
  readonly events: EventService;
  readonly registry: CapabilityRegistryService;
  readonly runtime: CapabilityRuntimeService;
  readonly search: SearchService;
  readonly media: MediaDomainService;
  readonly language: LanguageDomainService;
  readonly publishing: PublishingDomainService;
  readonly preservation: PreservationDomainService;
  readonly studio: KnowledgeStudio;
  readonly explorer: ArchiveExplorer;
}

export function createPlatform(): KmosPlatform {
  const bus = new EventBus({ catalog: createPlatformCatalog() });
  const identity = new IdentityService({ bus });
  const assets = new AssetRegistryService({ bus });
  const knowledge = new KnowledgeService({ bus });
  const governance = new GovernanceService({ bus });
  const events = new EventService({ bus });
  const registry = new CapabilityRegistryService({ bus });
  const runtime = new CapabilityRuntimeService({ bus });
  const search = new SearchService({ bus });
  const media = new MediaDomainService({ bus, assets, registry, runtime });
  const language = new LanguageDomainService({ bus, knowledge, registry, runtime });
  const publishing = new PublishingDomainService({ bus, assets, governance, registry, runtime });
  const preservation = new PreservationDomainService({ bus, assets });
  const studio = new KnowledgeStudio({ search, knowledge });
  const explorer = new ArchiveExplorer({ assets });
  return { bus, identity, assets, knowledge, governance, events, registry, runtime, search, media, language, publishing, preservation, studio, explorer };
}
