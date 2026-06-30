/**
 * Search & Discovery domain model (KMOS-0208 §2).
 *
 * Owned canonical objects:
 *  - SearchIndex      : a named, rebuildable projection of canonical objects.
 *  - IndexedDocument  : a single projection record (one per indexed subject id).
 *
 * CORE PRINCIPLE (KMOS-0130 §18): search indexes are PROJECTIONS, never the
 * system of record. Every IndexedDocument is derived from a canonical event and
 * is fully rebuildable from the immutable event log; the domain never treats the
 * index as authoritative.
 *
 * This module is pure: it imports only canonical types and contains no
 * infrastructure (constitution §1/§2).
 */

import type {
  CanonicalId,
  CanonicalObject,
  SecurityClassification,
} from '@kmos/canonical-kernel';

/** The fields a projection extracts from a canonical event payload for ranking. */
export interface IndexedFields {
  readonly name?: string;
  readonly displayName?: string;
  readonly objectType?: string; // the indexed canonical object's type (e.g. "Asset")
  readonly organizationId?: CanonicalId;
  readonly tags: readonly string[];
  readonly classification?: SecurityClassification;
}

/** The projection body for a single indexed canonical subject (KMOS-0208 §2). */
export interface IndexedDocumentBody {
  /** Canonical id of the subject this document represents (upsert key). */
  readonly subjectId: CanonicalId;
  /** Canonical event type that produced/refreshed this document. */
  readonly sourceEventType: string;
  /** Identifying fields extracted from the event payload. */
  readonly fields: IndexedFields;
  /** Free-text searchable content assembled from the fields. */
  readonly text: string;
  /** Deterministic embedding vector (filled by the Embedder port). */
  readonly vector: readonly number[];
}

/** The projection body for the SearchIndex aggregate (KMOS-0208 §2). */
export interface SearchIndexBody {
  readonly name: string;
  readonly documentCount: number;
  /** Sequence of the last log event folded into this index (for rebuild audit). */
  readonly lastSequence: number;
}

export type IndexedDocument = CanonicalObject<IndexedDocumentBody>;
export type SearchIndex = CanonicalObject<SearchIndexBody>;

/** Search modes (KMOS-0208 §3). */
export const SEARCH_MODES = ['keyword', 'vector', 'hybrid'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

/** Caller context used for governance-aware filtering (KMOS-0208 §3). */
export interface AccessContext {
  readonly actorId?: CanonicalId;
  readonly organizationId?: CanonicalId;
  /** Classifications the caller is cleared to see; undefined = no clearance limit. */
  readonly clearances?: readonly SecurityClassification[];
}

/** Query filters (KMOS-0208 §3). */
export interface SearchFilters {
  readonly type?: string;
  readonly organizationId?: CanonicalId;
  readonly tags?: readonly string[];
  readonly mode?: SearchMode;
  readonly limit?: number;
  /** Caller context for the AccessFilter port. */
  readonly access?: AccessContext;
}

/** A single ranked search hit. */
export interface SearchHit {
  readonly subjectId: CanonicalId;
  readonly score: number;
  readonly document: IndexedDocument;
}
