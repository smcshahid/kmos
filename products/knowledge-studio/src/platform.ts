/**
 * Knowledge Studio composition root.
 *
 * Every deployable owns its composition (KMOS-0200 §17). Knowledge Studio composes the
 * KMOS **platform substrate** through `@kmos/sdk` (the 8 platform services on one
 * canonical bus, durable/in-memory EventLog, boot recovery — ADR-0011), then adds the
 * two domains it orchestrates (media, language) and, optionally, a provider-backed
 * concept-extraction capability. It adds orchestration + UX only and bypasses nothing.
 *
 * The substrate wiring that used to live here was extracted to `@kmos/sdk` under
 * KCSI-01; domain composition stays here by design (the SDK may not import domains).
 */

import {
  createPlatformRuntime, createPlatformRuntimeFromEnv,
  type PlatformRuntime, type PlatformRuntimeOptions,
} from '@kmos/sdk';
import { MediaDomainService } from '@kmos/media';
import { LanguageDomainService } from '@kmos/language';
import type { ReferenceCapability } from '@kmos/reference-capabilities';

/** The platform substrate (@kmos/sdk) plus the two domains Knowledge Studio orchestrates. */
export interface StudioPlatform extends PlatformRuntime {
  readonly media: MediaDomainService;
  readonly language: LanguageDomainService;
}

export interface CreateStudioPlatformOptions extends PlatformRuntimeOptions {
  /** Optional provider-backed concept-extraction capability (e.g. Ollama, from
   * `@kmos/providers`). Defaults to the KMOS reference extractor. Provider-independent —
   * the business work stays inside the capability behind the contract (ADR-KS-0002). */
  readonly extraction?: ReferenceCapability;
}

/** Add the Studio's domains on top of a composed platform substrate. */
function withDomains(rt: PlatformRuntime, options: CreateStudioPlatformOptions): StudioPlatform {
  const media = new MediaDomainService({ bus: rt.bus, assets: rt.assets, registry: rt.registry, runtime: rt.runtime });
  const language = new LanguageDomainService({
    bus: rt.bus, knowledge: rt.knowledge, registry: rt.registry, runtime: rt.runtime,
    ...(options.extraction ? { extraction: options.extraction } : {}),
  });
  return { ...rt, media, language };
}

/** In-memory composition (dev/demo/tests). */
export function createStudioPlatform(options: CreateStudioPlatformOptions = {}): StudioPlatform {
  return withDomains(createPlatformRuntime(options), options);
}

/**
 * Environment-driven composition. Delegates to `@kmos/sdk`: when KMOS_DATABASE_URL is
 * set the canonical EventLog is PostgreSQL (durable system of record), the events table
 * DDL runs, every read model is rehydrated from the durable log (ADR-0011), and the
 * search projection is rebuilt — so a restarted Studio serves identical knowledge,
 * lineage, and trust. With no URL it runs fully in-memory.
 */
export async function createStudioPlatformFromEnv(options: CreateStudioPlatformOptions = {}): Promise<StudioPlatform> {
  return withDomains(await createPlatformRuntimeFromEnv(options), options);
}
