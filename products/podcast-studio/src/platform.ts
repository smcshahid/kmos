/**
 * Podcast Studio composition root.
 *
 * Every deployable owns its composition (KMOS-0200 §17). Podcast Studio composes the
 * KMOS platform substrate through `@kmos/sdk` (the 8 platform services on one canonical
 * bus, durable/in-memory EventLog, boot recovery — ADR-0011), then adds the two domains
 * it orchestrates (media, language) and, optionally, provider-backed capabilities. It
 * adds orchestration + UX only and bypasses nothing.
 *
 * The substrate wiring lives in `@kmos/sdk` (KCSI-01); domain composition stays here by
 * design (the SDK may not import domains).
 */

import {
  createPlatformRuntime, createPlatformRuntimeFromEnv,
  type PlatformRuntime, type PlatformRuntimeOptions,
} from '@kmos/sdk';
import { MediaDomainService } from '@kmos/media';
import { LanguageDomainService } from '@kmos/language';
import type { ReferenceCapability } from '@kmos/reference-capabilities';

/** The platform substrate plus the two domains Podcast Studio orchestrates. */
export interface PodcastPlatform extends PlatformRuntime {
  readonly media: MediaDomainService;
  readonly language: LanguageDomainService;
}

export interface CreatePodcastPlatformOptions extends PlatformRuntimeOptions {
  /** Optional provider-backed concept-extraction capability (e.g. Ollama, from
   * `@kmos/providers`). Defaults to the KMOS reference extractor. Provider-independent. */
  readonly extraction?: ReferenceCapability;
}

function withDomains(rt: PlatformRuntime, options: CreatePodcastPlatformOptions): PodcastPlatform {
  const media = new MediaDomainService({ bus: rt.bus, assets: rt.assets, registry: rt.registry, runtime: rt.runtime });
  const language = new LanguageDomainService({
    bus: rt.bus, knowledge: rt.knowledge, registry: rt.registry, runtime: rt.runtime,
    ...(options.extraction ? { extraction: options.extraction } : {}),
  });
  return { ...rt, media, language };
}

/** In-memory composition (dev/demo/tests). */
export function createPodcastPlatform(options: CreatePodcastPlatformOptions = {}): PodcastPlatform {
  return withDomains(createPlatformRuntime(options), options);
}

/** Environment-driven composition (durable PostgreSQL EventLog + boot recovery when
 * KMOS_DATABASE_URL is set; in-memory otherwise). Delegates to `@kmos/sdk`. */
export async function createPodcastPlatformFromEnv(options: CreatePodcastPlatformOptions = {}): Promise<PodcastPlatform> {
  return withDomains(await createPlatformRuntimeFromEnv(options), options);
}
