/**
 * CrawlStation composition root.
 *
 * Every deployable owns its composition (KMOS-0200 §17). CrawlStation composes the KMOS
 * **platform substrate** through `@kmos/sdk` (the 8 platform services on one canonical
 * event bus, durable/in-memory EventLog, boot recovery — ADR-0011) and adds NOTHING
 * else: unlike Knowledge Studio and Podcast Studio it needs no domain services, because
 * web acquisition maps directly onto platform primitives — Assets (evidence + lineage),
 * Knowledge (each page as a Topic), Governance (trust), and Search. The product's own
 * acquisition logic (crawl frontier, HTML extraction, URL/robots rules) lives beside
 * this file as pure modules, not as platform capabilities (evidence-first mandate).
 *
 * This is the cleanest possible KMOS product: a thin experience over the substrate.
 */

import {
  createPlatformRuntime, createPlatformRuntimeFromEnv,
  type PlatformRuntime, type PlatformRuntimeOptions,
} from '@kmos/sdk';

/** CrawlStation's platform is exactly the KMOS substrate — no domains added. */
export type CrawlPlatform = PlatformRuntime;

/** In-memory composition (dev/demo/tests). */
export function createCrawlPlatform(options: PlatformRuntimeOptions = {}): CrawlPlatform {
  return createPlatformRuntime(options);
}

/**
 * Environment-driven composition. Delegates to `@kmos/sdk`: when KMOS_DATABASE_URL is
 * set the canonical EventLog is PostgreSQL (durable system of record), the events table
 * DDL runs, every read model is rehydrated from the durable log (ADR-0011), and the
 * search projection is rebuilt — so a restarted CrawlStation serves identical acquired
 * knowledge, evidence, lineage, and trust. With no URL it runs fully in-memory.
 */
export async function createCrawlPlatformFromEnv(options: PlatformRuntimeOptions = {}): Promise<CrawlPlatform> {
  return createPlatformRuntimeFromEnv(options);
}
