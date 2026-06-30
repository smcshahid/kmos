/**
 * Public API (KMOS-0180, WP-22).
 *
 * A THIN canonical business-operations FACADE. It exposes the institution's
 * business CAPABILITIES (KMOS-0180 §"APIs are interfaces to business
 * capabilities") over CANONICAL RESOURCES and CANONICAL EVENTS, by composing
 * the injected platform services through their business APIs. It owns NO
 * business logic and NO canonical objects: applications are replaceable views
 * over the platform (KMOS-9999 §9).
 *
 * Contract (KMOS-0180):
 *  - APIs expose business capabilities; events expose business facts.
 *  - Every exposed resource references canonical identifiers and is a canonical
 *    object/event. The facade returns canonical objects ONLY.
 *  - APIs SHALL NOT expose implementation details: no database rows, no internal
 *    repository/storage shapes, no broker/transport types. This facade therefore
 *    only re-exports kernel canonical types (objects, events) and never any
 *    service-internal infrastructure type.
 *
 * Cross-service contact happens through canonical events on a SHARED bus and the
 * services' canonical APIs only (Constitution §3): the caller wires Knowledge,
 * Assets, Search and Events onto one bus and injects them here.
 */

import type {
  CanonicalId,
  CanonicalEvent,
  EventHandler,
  StoredEvent,
} from '@kmos/canonical-kernel';
import type {
  KnowledgeService,
  KnowledgeObject,
  CreateKnowledgeInput,
} from '@kmos/knowledge';
import type {
  AssetRegistryService,
  AssetObject,
  RegisterAssetInput,
} from '@kmos/assets';
import type { SearchService, SearchFilters, SearchHit } from '@kmos/search';
import type { EventService } from '@kmos/events';

/** Injected platform services composed by the facade (KMOS-0180). */
export interface PublicApiOptions {
  readonly knowledge: KnowledgeService;
  readonly assets: AssetRegistryService;
  readonly search: SearchService;
  readonly events: EventService;
}

/**
 * The canonical resources/events the facade exposes. Deliberately built only
 * from kernel + service canonical types — never from infrastructure shapes.
 */
export type {
  KnowledgeObject,
  AssetObject,
  SearchHit,
  CanonicalEvent,
  StoredEvent,
};

export class PublicApi {
  private readonly knowledge: KnowledgeService;
  private readonly assets: AssetRegistryService;
  private readonly search: SearchService;
  private readonly events: EventService;

  constructor(opts: PublicApiOptions) {
    this.knowledge = opts.knowledge;
    this.assets = opts.assets;
    this.search = opts.search;
    this.events = opts.events;
  }

  // --- Canonical resource reads (KMOS-0180 §"Canonical Resources") --------

  /** Read a KnowledgeObject by its canonical id. Returns a canonical object. */
  getKnowledge(id: CanonicalId): KnowledgeObject | undefined {
    return this.knowledge.getKnowledge(id);
  }

  /** Read an Asset by its canonical id. Returns a canonical Asset object. */
  getAsset(id: CanonicalId): AssetObject {
    return this.assets.getAsset(id);
  }

  /**
   * Discover knowledge by query. Delegates to the Search Service; each hit
   * references a canonical identifier and carries the canonical IndexedDocument
   * projection — no storage/index internals leak.
   */
  searchKnowledge(query: string, filters: SearchFilters = {}): readonly SearchHit[] {
    return this.search.search(query, filters);
  }

  // --- Canonical operations ----------------------------------------------

  /**
   * Create a KnowledgeObject. Delegates the business operation to the Knowledge
   * Service and returns the resulting CANONICAL KnowledgeObject (with its
   * `kmos:` identifier). The facade adds no logic.
   */
  createKnowledge(input: CreateKnowledgeInput): KnowledgeObject {
    return this.knowledge.createKnowledge(input);
  }

  /**
   * Register an Asset. Delegates to the Asset Registry and returns the canonical
   * Asset object whose identity is independent of any storage detail.
   */
  registerAsset(input: RegisterAssetInput): Promise<AssetObject> {
    return this.assets.registerAsset(input);
  }

  // --- Event subscriptions (KMOS-0180 §"Events expose business facts") ----

  /**
   * Subscribe to canonical events so external consumers can react to business
   * facts. Delegates to the Event Service's governed subscription API. The
   * handler receives canonical events only.
   */
  subscribe(
    subscriber: string,
    eventTypes: readonly string[],
    handler: EventHandler,
  ): void {
    this.events.createSubscription(subscriber, eventTypes, handler);
  }

  /**
   * Read the canonical event history for a stream (e.g. a subject's canonical
   * id). Returns canonical events in append order; no broker/log internals are
   * exposed beyond the canonical sequence/stream position.
   */
  getEventHistory(streamId: string): readonly StoredEvent[] {
    return this.events.getEventHistory(streamId);
  }
}
