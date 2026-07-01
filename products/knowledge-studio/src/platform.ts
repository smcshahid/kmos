/**
 * Knowledge Studio composition root.
 *
 * Every deployable owns its composition (KMOS-0200 §17). Knowledge Studio composes
 * exactly the KMOS services it needs onto ONE shared canonical event bus and uses
 * them through their public business APIs — it adds orchestration + UX only and
 * bypasses nothing. The wiring mirrors the reference platform (durable PostgreSQL
 * EventLog + read-model recovery on boot when KMOS_DATABASE_URL is set).
 */

import { EventBus, type Authorizer, type EventLog } from '@kmos/canonical-kernel';
import { PgSqlClient, PostgresEventLog, EVENTS_TABLE_DDL, EventService } from '@kmos/events';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { IdentityService } from '@kmos/identity';
import { AssetRegistryService } from '@kmos/assets';
import { KnowledgeService } from '@kmos/knowledge';
import { GovernanceService } from '@kmos/governance';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { SearchService } from '@kmos/search';
import { MediaDomainService } from '@kmos/media';
import { LanguageDomainService } from '@kmos/language';

export interface StudioPlatform {
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
}

export interface CreateStudioPlatformOptions {
  readonly enforce?: boolean;
  readonly authorizer?: Authorizer;
}

function wire(bus: EventBus): StudioPlatform {
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
  return { bus, identity, assets, knowledge, governance, events, registry, runtime, search, media, language };
}

function makeBus(log: EventLog | undefined, options: CreateStudioPlatformOptions): EventBus {
  return new EventBus({
    catalog: createPlatformCatalog(),
    ...(log ? { log } : {}),
    ...(options.enforce ? { requireActor: true } : {}),
    ...(options.authorizer ? { authorizer: options.authorizer } : {}),
  });
}

/** In-memory composition (dev/demo/tests). */
export function createStudioPlatform(options: CreateStudioPlatformOptions = {}): StudioPlatform {
  return wire(makeBus(undefined, options));
}

/**
 * Environment-driven composition. When KMOS_DATABASE_URL is set the canonical
 * EventLog is backed by PostgreSQL (durable system of record); on boot the events
 * table DDL runs (idempotent), every service's read model is rehydrated from the
 * durable log (ADR-0011), and the search projection is rebuilt — so a restarted
 * Studio serves identical knowledge, lineage, and trust. With no URL it runs fully
 * in-memory.
 */
export async function createStudioPlatformFromEnv(options: CreateStudioPlatformOptions = {}): Promise<StudioPlatform> {
  const url = process.env.KMOS_DATABASE_URL;
  if (!url) return createStudioPlatform(options);

  const sql = new PgSqlClient(url);
  await sql.query(EVENTS_TABLE_DDL);
  const platform = wire(makeBus(new PostgresEventLog(sql), options));
  await Promise.all([
    platform.knowledge.hydrate(),
    platform.assets.hydrate(),
    platform.governance.hydrate(),
    platform.identity.hydrate(),
    platform.registry.hydrate(),
  ]);
  await platform.search.rebuild();
  return platform;
}
