/**
 * Platform-substrate composition (KCSI-01 WP4).
 *
 * Extracted from products/knowledge-studio/src/platform.ts:47-102 — the wiring EVERY
 * KMOS deployable must repeat: the 8 platform services on ONE canonical event bus, a
 * durable PostgreSQL EventLog (or in-memory), and read-model recovery on boot
 * (ADR-0011). An application composes this substrate, then adds its OWN domains on top
 * — domain composition stays in the app (KMOS-0200 §17), and the SDK (capabilities/sdk
 * layer) may not import domains (fitness dependency rule), so this factory deliberately
 * stops at the platform layer. See documentation/CAPABILITY-EVOLUTION-ROADMAP.md §3.
 */

import { EventBus, InMemoryEventLog, type Authorizer, type EventLog } from '@kmos/canonical-kernel';
import { PgSqlClient, PostgresEventLog, EVENTS_TABLE_DDL, EventService } from '@kmos/events';
import { createPlatformCatalog } from '@kmos/platform-catalog';
import { IdentityService } from '@kmos/identity';
import { AssetRegistryService } from '@kmos/assets';
import { KnowledgeService } from '@kmos/knowledge';
import { GovernanceService } from '@kmos/governance';
import { CapabilityRegistryService } from '@kmos/capability-registry';
import { CapabilityRuntimeService } from '@kmos/capability-runtime';
import { SearchService } from '@kmos/search';

/** The composed platform substrate: the canonical bus + the 8 platform services. */
export interface PlatformRuntime {
  readonly bus: EventBus;
  readonly identity: IdentityService;
  readonly assets: AssetRegistryService;
  readonly knowledge: KnowledgeService;
  readonly governance: GovernanceService;
  readonly events: EventService;
  readonly registry: CapabilityRegistryService;
  readonly runtime: CapabilityRuntimeService;
  readonly search: SearchService;
}

export interface PlatformRuntimeOptions {
  /** Require an actor on every write (attribution enforcement). */
  readonly enforce?: boolean;
  /** Optional authorizer for the bus. */
  readonly authorizer?: Authorizer;
  /** Inject a durable/in-memory EventLog directly (tests, custom adapters). When
   *  omitted the bus uses its own in-memory log. */
  readonly log?: EventLog;
  /** PostgreSQL URL for the durable EventLog (from-env factory). Defaults to
   *  process.env.KMOS_DATABASE_URL. */
  readonly databaseUrl?: string;
}

function makeBus(log: EventLog | undefined, options: PlatformRuntimeOptions): EventBus {
  return new EventBus({
    catalog: createPlatformCatalog(),
    ...(log ? { log } : {}),
    ...(options.enforce ? { requireActor: true } : {}),
    ...(options.authorizer ? { authorizer: options.authorizer } : {}),
  });
}

function wire(bus: EventBus): PlatformRuntime {
  const identity = new IdentityService({ bus });
  const assets = new AssetRegistryService({ bus });
  const knowledge = new KnowledgeService({ bus });
  const governance = new GovernanceService({ bus });
  const events = new EventService({ bus });
  const registry = new CapabilityRegistryService({ bus });
  const runtime = new CapabilityRuntimeService({ bus });
  const search = new SearchService({ bus });
  return { bus, identity, assets, knowledge, governance, events, registry, runtime, search };
}

/**
 * Compose the platform substrate synchronously (dev/demo/tests, or with an injected
 * `log`). For env-driven durable composition with boot recovery use
 * {@link createPlatformRuntimeFromEnv}.
 */
export function createPlatformRuntime(options: PlatformRuntimeOptions = {}): PlatformRuntime {
  return wire(makeBus(options.log, options));
}

/**
 * Read-model recovery (ADR-0011): rebuild every repository from the durable log, then
 * rebuild the search projection. Safe to call on any runtime; a no-op of value only
 * when the bus is backed by a populated durable log.
 */
export async function hydratePlatformRuntime(rt: PlatformRuntime): Promise<void> {
  await Promise.all([
    rt.knowledge.hydrate(),
    rt.assets.hydrate(),
    rt.governance.hydrate(),
    rt.identity.hydrate(),
    rt.registry.hydrate(),
  ]);
  await rt.search.rebuild();
}

/**
 * Environment-driven composition. When a database URL is present (option or
 * KMOS_DATABASE_URL) the canonical EventLog is PostgreSQL (durable system of record):
 * the events table DDL runs (idempotent), every read model is rehydrated from the log,
 * and the search projection is rebuilt — so a restarted app serves identical knowledge,
 * lineage, and trust. With no URL it runs fully in-memory.
 */
export async function createPlatformRuntimeFromEnv(
  options: PlatformRuntimeOptions = {},
): Promise<PlatformRuntime> {
  const url = options.databaseUrl ?? process.env.KMOS_DATABASE_URL;
  if (!url) return createPlatformRuntime(options);

  const sql = new PgSqlClient(url);
  await sql.query(EVENTS_TABLE_DDL);
  const rt = createPlatformRuntime({ ...options, log: new PostgresEventLog(sql) });
  await hydratePlatformRuntime(rt);
  return rt;
}

/** Convenience: a fresh in-memory durable log for tests / recovery scenarios. */
export function newInMemoryEventLog(): EventLog {
  return new InMemoryEventLog();
}
