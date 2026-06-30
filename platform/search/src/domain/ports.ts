/**
 * Ports for the Search & Discovery Service (KMOS-0208 §5; constitution §2).
 *
 * These interfaces live in the domain; adapters in `infrastructure/` implement
 * them. The domain core never imports a database driver, vector engine, or IdP —
 * keeping OpenSearch/pgvector/IdP swappable behind stable contracts.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type {
  AccessContext,
  IndexedDocument,
  SearchFilters,
} from './model.js';

/**
 * IndexStore PORT — an inverted index (token -> doc ids) plus a vector store.
 *
 * The in-memory adapter implements this now; OpenSearch / pgvector adapters
 * implement the same contract later (KMOS-0208 §5). Upserts are keyed by the
 * subject's canonical id, which makes event-driven indexing idempotent.
 */
export interface IndexStore {
  /** Upsert a document by its subject id (idempotent re-index). */
  upsert(doc: IndexedDocument): void;
  get(subjectId: CanonicalId): IndexedDocument | undefined;
  all(): readonly IndexedDocument[];
  size(): number;
  /** Document ids whose text contains the given token (inverted index lookup). */
  postings(token: string): readonly CanonicalId[];
  /** Number of documents containing the token (for IDF). */
  docFrequency(token: string): number;
  clear(): void;
}

/**
 * Embedder PORT — turns text into a fixed-dimension vector (KMOS-0208 §5).
 *
 * The default adapter is a DETERMINISTIC token-hashing stub (no model, no IO),
 * so projections and replay stay reproducible (constitution §6). A real model
 * adapter replaces it without touching the domain.
 */
export interface Embedder {
  readonly dimension: number;
  embed(text: string): readonly number[];
}

/**
 * AccessFilter PORT — governance-aware result filtering (KMOS-0208 §3/§5).
 *
 * Filters out documents the caller is not authorized to see, based on the
 * document classification and the caller's organization/clearances. The default
 * adapter is allow-all; an Identity/Governance-backed adapter replaces it.
 */
export interface AccessFilter {
  canRead(doc: IndexedDocument, context: AccessContext | undefined): boolean;
}

/** A structural filter applied before ranking (type/org/tags). Pure helper contract. */
export type StructuralFilter = (doc: IndexedDocument, filters: SearchFilters) => boolean;
