/**
 * Publication metadata-generation capability (reference/deterministic).
 * KMOS-0002 Publishing, KMOS-0160.
 *
 * This is where the BUSINESS WORK lives — the Publishing domain itself holds no
 * business logic (constitution §5/§10): given a title plus the knowledge/asset
 * refs to be published, it derives publication metadata (title, summary, tags,
 * slug). The handler is STRUCTURALLY compatible with the Capability Runtime's
 * CapabilityHandler port (invoke + health), so the capability stays free of any
 * runtime dependency (a capability outlives its implementation/runtime,
 * KMOS-0120 §3). The domain registers it in the Registry + Runtime in setup().
 *
 * Determinism (constitution §6): output is a pure function of input — no clock,
 * no randomness, no IO — so the workflow that drives it is fully replayable.
 */

export type HealthState =
  | 'Unknown' | 'Starting' | 'Ready' | 'Busy' | 'Degraded' | 'Unavailable';

export interface InvocationContext {
  readonly capabilityId?: string;
  readonly version?: string;
  readonly correlationId?: string;
  readonly organizationId?: string;
  readonly configuration?: Readonly<Record<string, unknown>>;
}

/** Structural mirror of the Capability Runtime's CapabilityHandler port. */
export interface CapabilityHandler<I = unknown, O = unknown> {
  invoke(input: I, context: InvocationContext): Promise<O>;
  health(): HealthState;
}

/** Registration descriptor for the Capability Registry (KMOS-0120 §6). */
export interface CapabilityDescriptor {
  readonly name: string;
  readonly ownerDomain: string;
  readonly businessPurpose: string;
  readonly version: string;
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly contract: {
    readonly acceptedObjects: readonly string[];
    readonly producedObjects: readonly string[];
    readonly consumedEvents: readonly string[];
    readonly publishedEvents: readonly string[];
  };
}

export interface MetadataGenerationInput {
  readonly title: string;
  readonly knowledgeIds: readonly string[];
  readonly assetIds: readonly string[];
}

export interface PublicationMetadata {
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly slug: string;
}

export const metadataGenerationDescriptor: CapabilityDescriptor = {
  name: 'PublicationMetadataGeneration',
  ownerDomain: 'Publishing',
  businessPurpose: 'Generate publication metadata (title, summary, tags, slug) from a title and knowledge/asset references',
  version: '1.0.0',
  inputs: ['Knowledge', 'Asset'],
  outputs: ['PublicationMetadata'],
  contract: {
    acceptedObjects: ['Knowledge', 'Asset'],
    producedObjects: ['PublicationMetadata'],
    consumedEvents: ['KnowledgeRegistered', 'AssetRegistered'],
    publishedEvents: ['PublicationMetadataGenerated'],
  },
};

/** Deterministic slug: lowercase, non-alphanumerics to single hyphens, trimmed. */
function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'publication';
}

/** Deterministic tags derived from the title's significant words. */
function deriveTags(title: string): readonly string[] {
  const seen = new Set<string>();
  for (const word of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 3) seen.add(word);
  }
  return [...seen].sort().slice(0, 8);
}

export function createMetadataGenerationHandler(): CapabilityHandler<MetadataGenerationInput, PublicationMetadata> {
  return {
    health: () => 'Ready',
    invoke: async (input) => {
      const knowledgeCount = input.knowledgeIds.length;
      const assetCount = input.assetIds.length;
      return {
        title: input.title,
        summary: `${input.title} — a publication synthesizing ${knowledgeCount} knowledge item(s) and ${assetCount} asset(s).`,
        tags: deriveTags(input.title),
        slug: slugify(input.title),
      };
    },
  };
}
