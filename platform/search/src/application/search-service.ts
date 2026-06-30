/**
 * Search & Discovery Service application layer (KMOS-0208).
 *
 * Makes canonical objects discoverable across the platform as event-driven
 * PROJECTIONS (never the system of record, KMOS-0130 §18). Responsibilities:
 *  - subscribe to canonical events on construction and upsert IndexedDocuments
 *    idempotently (upsert-by-canonical-id; at-least-once safe, KMOS-0208 §3);
 *  - query keyword / vector / hybrid (RRF) with type/org/tag filters;
 *  - rebuild any index from the immutable log via the kernel replay engine with
 *    an atomic alias swap (zero-downtime; history untouched);
 *  - governance-aware result filtering via the AccessFilter port.
 *
 * EVENT CATALOG NOTE (KMOS-0208 §4): the Search lifecycle events (IndexCreated,
 * KnowledgeIndexed, AssetIndexed, IndexRebuilt) are not in the kernel seed. If
 * the service both subscribes to and publishes on the SAME injected bus, that
 * bus MUST be built with `createSearchCatalog()` so the published index events
 * validate. The default (no bus injected) bus is built that way automatically.
 * Tests that inject a bus should construct it with `createSearchCatalog()`.
 */

import {
  EventBus,
  createCanonicalObject,
  createEvent,
  newCanonicalId,
  replay,
  type CanonicalId,
  type Projection,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import { createSearchCatalog } from '../domain/catalog.js';
import {
  type SearchHit,
  type SearchFilters,
  type SearchIndex,
  type SearchIndexBody,
  type IndexedDocument,
} from '../domain/model.js';
import type { AccessFilter, Embedder, IndexStore } from '../domain/ports.js';
import {
  bm25Score,
  cosineSimilarity,
  reciprocalRankFusion,
  tokenize,
  RRF_K,
  type RankedList,
} from '../domain/ranking.js';
import { InMemoryIndexStore } from '../infrastructure/in-memory-index-store.js';
import { HashingEmbedder } from '../infrastructure/hashing-embedder.js';
import { AllowAllAccessFilter } from '../infrastructure/allow-all-access-filter.js';
import {
  INDEXED_EVENT_TYPES,
  projectDocument,
} from './projection.js';

const SUBSCRIBER = 'SearchService';
const DEFAULT_INDEX_NAME = 'kmos-default';

export interface SearchServiceOptions {
  /**
   * Injected event bus. Defaults to a new bus built with the Search catalog so
   * index lifecycle events validate. When injecting your own bus, build it with
   * `createSearchCatalog()` (see the class doc note).
   */
  readonly bus?: EventBus;
  /** Deterministic clock for projection/lifecycle timestamps (tests/replay). */
  readonly now?: () => string;
  /** IndexStore port adapter (default: in-memory inverted index). */
  readonly store?: IndexStore;
  /** Embedder port adapter (default: deterministic hashing stub). */
  readonly embedder?: Embedder;
  /** AccessFilter port adapter (default: allow-all). */
  readonly accessFilter?: AccessFilter;
  readonly indexName?: string;
}

export class SearchService {
  private readonly bus: EventBus;
  private readonly now: () => string;
  private readonly embedder: Embedder;
  private readonly accessFilter: AccessFilter;
  private readonly indexName: string;
  /**
   * The active store, behind an ALIAS pointer. rebuild() builds a fresh store and
   * atomically swaps this reference (KMOS-0208 §3 zero-downtime swap).
   */
  private store: IndexStore;
  private indexObject: SearchIndex;

  constructor(options: SearchServiceOptions = {}) {
    this.bus = options.bus ?? new EventBus({ catalog: createSearchCatalog() });
    this.now = options.now ?? (() => new Date().toISOString());
    this.store = options.store ?? new InMemoryIndexStore();
    this.embedder = options.embedder ?? new HashingEmbedder();
    this.accessFilter = options.accessFilter ?? new AllowAllAccessFilter();
    this.indexName = options.indexName ?? DEFAULT_INDEX_NAME;
    this.indexObject = this.newIndexObject(0, 0);

    // Event-driven indexing: subscribe to canonical events (KMOS-0208 §3).
    this.bus.subscribe({
      subscriber: SUBSCRIBER,
      eventTypes: INDEXED_EVENT_TYPES,
      handler: (stored: StoredEvent) => {
        this.indexStored(stored);
      },
    });

    void this.emit('IndexCreated', this.indexObject.id, {
      indexName: this.indexName,
      index: this.indexObject.id,
    });
  }

  /** Underlying bus (for advanced/inter-service wiring within the monolith). */
  get eventBus(): EventBus {
    return this.bus;
  }

  /** The current SearchIndex projection object. */
  getIndex(): SearchIndex {
    return this.indexObject;
  }

  getDocument(subjectId: CanonicalId): IndexedDocument | undefined {
    return this.store.get(subjectId);
  }

  documentCount(): number {
    return this.store.size();
  }

  // ---- Indexing (idempotent, upsert-by-subject-id) ----

  /** Project a stored event into the active index and emit an indexed event. */
  private indexStored(stored: StoredEvent): void {
    if (!INDEXED_EVENT_TYPES.includes(stored.event.identity.type)) return;
    this.indexInto(this.store, stored);
    this.indexObject = this.newIndexObject(this.store.size(), stored.sequence);
    const subjectId = stored.event.identity.subjectId ?? stored.event.identity.eventId;
    const eventType = stored.event.identity.type === 'AssetRegistered' ? 'AssetIndexed' : 'KnowledgeIndexed';
    void this.emit(eventType, subjectId, { subjectId, sourceEventType: stored.event.identity.type });
  }

  /** Pure index write: project + embed + upsert (idempotent by subject id). */
  private indexInto(store: IndexStore, stored: StoredEvent): void {
    const fieldsText = this.previewText(stored);
    const vector = this.embedder.embed(fieldsText);
    const doc = projectDocument(stored, vector, this.now());
    store.upsert(doc);
  }

  /** Text used for embedding, mirroring the projection's text assembly. */
  private previewText(stored: StoredEvent): string {
    const doc = projectDocument(stored, [], this.now());
    return doc.body.text;
  }

  // ---- Query (keyword / vector / hybrid) ----

  /**
   * Search the active index. Applies structural filters (type/org/tags), ranks
   * by the requested mode, then governance-filters via the AccessFilter port.
   */
  search(queryText: string, filters: SearchFilters = {}): readonly SearchHit[] {
    const mode = filters.mode ?? 'keyword';
    const candidates = this.store
      .all()
      .filter((doc) => this.structuralMatch(doc, filters))
      .filter((doc) => this.accessFilter.canRead(doc, filters.access));

    let hits: SearchHit[];
    if (mode === 'keyword') {
      hits = this.keywordHits(queryText, candidates);
    } else if (mode === 'vector') {
      hits = this.vectorHits(queryText, candidates);
    } else {
      hits = this.hybridHits(queryText, candidates);
    }

    hits.sort((a, b) => (b.score - a.score) || a.subjectId.localeCompare(b.subjectId));
    const limit = filters.limit ?? hits.length;
    return hits.slice(0, limit);
  }

  private structuralMatch(doc: IndexedDocument, filters: SearchFilters): boolean {
    if (filters.type && doc.body.fields.objectType !== filters.type) return false;
    if (filters.organizationId && doc.body.fields.organizationId !== filters.organizationId) return false;
    if (filters.tags && filters.tags.length > 0) {
      const docTags = new Set(doc.body.fields.tags.map((t) => t.toLowerCase()));
      if (!filters.tags.every((t) => docTags.has(t.toLowerCase()))) return false;
    }
    return true;
  }

  private keywordHits(queryText: string, candidates: readonly IndexedDocument[]): SearchHit[] {
    const queryTokens = tokenize(queryText);
    if (queryTokens.length === 0) return [];
    const totalDocs = this.store.size();
    const avg = this.averageDocLength(candidates);
    const hits: SearchHit[] = [];
    for (const doc of candidates) {
      const docTokens = tokenize(doc.body.text);
      const score = bm25Score(queryTokens, docTokens, this.store, avg, totalDocs);
      if (score > 0) hits.push({ subjectId: doc.body.subjectId, score, document: doc });
    }
    return hits;
  }

  private vectorHits(queryText: string, candidates: readonly IndexedDocument[]): SearchHit[] {
    const qv = this.embedder.embed(queryText);
    const hits: SearchHit[] = [];
    for (const doc of candidates) {
      const score = cosineSimilarity(qv, doc.body.vector);
      if (score > 0) hits.push({ subjectId: doc.body.subjectId, score, document: doc });
    }
    return hits;
  }

  /** Hybrid: fuse keyword + vector rankings with Reciprocal Rank Fusion (k=60). */
  private hybridHits(queryText: string, candidates: readonly IndexedDocument[]): SearchHit[] {
    const keyword = this.keywordHits(queryText, candidates);
    const vector = this.vectorHits(queryText, candidates);
    const rankOf = (hits: readonly SearchHit[]): RankedList =>
      [...hits].sort((a, b) => b.score - a.score).map((h) => h.subjectId);
    const fused = reciprocalRankFusion([rankOf(keyword), rankOf(vector)], RRF_K);

    const byId = new Map<CanonicalId, IndexedDocument>();
    for (const doc of candidates) byId.set(doc.body.subjectId, doc);

    const hits: SearchHit[] = [];
    for (const [subjectId, score] of fused) {
      const document = byId.get(subjectId);
      if (document) hits.push({ subjectId, score, document });
    }
    return hits;
  }

  private averageDocLength(candidates: readonly IndexedDocument[]): number {
    if (candidates.length === 0) return 1;
    let total = 0;
    for (const doc of candidates) total += tokenize(doc.body.text).length;
    return total / candidates.length;
  }

  // ---- Rebuild via replay (atomic alias swap; history untouched) ----

  /**
   * Rebuild the index by replaying the ENTIRE immutable event log into a FRESH
   * store via the kernel replay engine, then atomically swapping the alias
   * pointer (KMOS-0208 §3). The log is never mutated. Returns the rebuilt index.
   */
  rebuild(): SearchIndex {
    const shadow = new InMemoryIndexStore();
    const projection: Projection<IndexStore> = {
      name: 'SearchIndex',
      initial: () => shadow,
      apply: (state, stored) => {
        if (INDEXED_EVENT_TYPES.includes(stored.event.identity.type)) {
          this.indexInto(state, stored);
        }
        return state;
      },
    };
    const result = replay(this.bus.eventLog, projection, { now: this.now });
    // Atomic alias swap: readers see either the old or the new store, never a
    // half-built one (single-threaded reference assignment).
    this.store = result.state;
    this.indexObject = this.newIndexObject(this.store.size(), result.session.toSequence);
    void this.emit('IndexRebuilt', this.indexObject.id, {
      indexName: this.indexName,
      index: this.indexObject.id,
      documentCount: this.store.size(),
      eventsApplied: result.session.eventsApplied,
    });
    return this.indexObject;
  }

  // ---- internals ----

  private newIndexObject(documentCount: number, lastSequence: number): SearchIndex {
    return createCanonicalObject<SearchIndexBody>({
      id: this.indexObject?.id ?? newCanonicalId('SearchIndex'),
      type: 'SearchIndex',
      schemaVersion: '1.0',
      owner: 'SearchService',
      lifecycle: 'Active',
      displayName: this.indexName,
      body: { name: this.indexName, documentCount, lastSequence },
      now: this.now(),
    });
  }

  private async emit(type: string, subjectId: CanonicalId, payload: Record<string, unknown>): Promise<void> {
    const ev = createEvent({
      type,
      schemaVersion: '1.0',
      producer: 'SearchService',
      subjectId,
      payload,
      time: this.now(),
    });
    await this.bus.publish(ev, { streamId: subjectId });
  }
}
