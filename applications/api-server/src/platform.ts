/**
 * Composition root: wires the whole KMOS platform on ONE shared canonical event
 * bus and returns the services/domains/applications the HTTP server exposes.
 * This is the in-process modular-monolith composition (KMOS-0200 §17); the same
 * wiring runs behind real persistence/transport adapters in production.
 */
import { EventBus, type Authorizer, type EventLog } from '@kmos/canonical-kernel';
import { PgSqlClient, PostgresEventLog, EVENTS_TABLE_DDL } from '@kmos/events';
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

export interface CreatePlatformOptions {
  /**
   * Run the bus in ENFORCING mode (CRIT-2): every published canonical fact MUST
   * carry an acting `actorId`. Compose with `runWithContext({ actorId, … }, …)`
   * at the request boundary (see the auth seam in the Security guide) so each
   * operation is attributed. Default `false` keeps the reference/demo composition
   * non-enforcing and backward compatible.
   */
  readonly enforce?: boolean;
  /** Optional policy decision point consulted before publication (KMOS-0190). */
  readonly authorizer?: Authorizer;
}

/** Wire every service/domain/application onto one shared bus. */
function wireServices(bus: EventBus): KmosPlatform {
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

function makeBus(log: EventLog | undefined, options: CreatePlatformOptions): EventBus {
  return new EventBus({
    catalog: createPlatformCatalog(),
    ...(log ? { log } : {}),
    ...(options.enforce ? { requireActor: true } : {}),
    ...(options.authorizer ? { authorizer: options.authorizer } : {}),
  });
}

/** In-memory composition (dev/demo/tests). */
export function createPlatform(options: CreatePlatformOptions = {}): KmosPlatform {
  return wireServices(makeBus(undefined, options));
}

/**
 * Environment-driven composition for real deployments (Olares / Kubernetes /
 * docker-compose). When `KMOS_DATABASE_URL` is set, the canonical `EventLog` —
 * the institutional system of record — is backed by real PostgreSQL
 * (`PgSqlClient` + `PostgresEventLog`); the events table is created on boot
 * (idempotent DDL) and the search index is rebuilt from the durable log. With no
 * URL, the platform runs fully in-memory.
 *
 * HONEST SCOPE: this makes the **event log durable across restarts** (the system
 * of record survives) and rebuilds the **search projection** on boot. Repository-
 * backed object detail (e.g. `GET /knowledge/:id`) is NOT yet rebuilt from the
 * log on boot — that is the tracked read-model-persistence roadmap item
 * (engineering/review/16 §6/§17). Do not run more than one replica until it lands
 * (in-memory projections are per-pod).
 */
export async function createPlatformFromEnv(options: CreatePlatformOptions = {}): Promise<KmosPlatform> {
  const url = process.env.KMOS_DATABASE_URL;
  if (!url) return createPlatform(options);

  const sql = new PgSqlClient(url);
  await sql.query(EVENTS_TABLE_DDL); // idempotent migration — safe on every boot
  const platform = wireServices(makeBus(new PostgresEventLog(sql), options));
  // Read-model recovery on boot (ADR-0011): rebuild every service's repositories
  // from the durable event log so object retrieval, lineage, governance, and
  // identity/authorization behave IDENTICALLY after a restart. Hydration writes
  // directly to in-memory repositories from the events' object snapshots and does
  // NOT re-publish, so no duplicate facts enter the log.
  await Promise.all([
    platform.knowledge.hydrate(),
    platform.assets.hydrate(),
    platform.governance.hydrate(),
    platform.identity.hydrate(),
    platform.registry.hydrate(),
  ]);
  // Rebuild the search projection from the durable log (single IndexRebuilt event).
  await platform.search.rebuild();
  return platform;
}
