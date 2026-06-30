/**
 * In-memory IndexStore adapter (KMOS-0208 §5; modular-monolith-first).
 *
 * Implements the IndexStore port with a documents map (upsert-by-subject-id) and
 * an inverted index (token -> set of subject ids). A vector store is unnecessary
 * as a separate structure: each IndexedDocument already carries its vector, and
 * vector search iterates the documents. An OpenSearch / pgvector adapter will
 * implement the same port later without changing the application or domain.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { IndexedDocument } from '../domain/model.js';
import type { IndexStore } from '../domain/ports.js';
import { tokenize } from '../domain/ranking.js';

export class InMemoryIndexStore implements IndexStore {
  private readonly docs = new Map<CanonicalId, IndexedDocument>();
  /** token -> set of subject ids containing it (inverted index). */
  private readonly inverted = new Map<string, Set<CanonicalId>>();

  upsert(doc: IndexedDocument): void {
    const subjectId = doc.body.subjectId;
    // Remove stale postings for an existing document before re-indexing.
    const existing = this.docs.get(subjectId);
    if (existing) this.removePostings(subjectId, existing);
    this.docs.set(subjectId, doc);
    this.addPostings(subjectId, doc);
  }

  get(subjectId: CanonicalId): IndexedDocument | undefined {
    return this.docs.get(subjectId);
  }

  all(): readonly IndexedDocument[] {
    return [...this.docs.values()];
  }

  size(): number {
    return this.docs.size;
  }

  postings(token: string): readonly CanonicalId[] {
    const set = this.inverted.get(token.toLowerCase());
    return set ? [...set] : [];
  }

  docFrequency(token: string): number {
    return this.inverted.get(token.toLowerCase())?.size ?? 0;
  }

  clear(): void {
    this.docs.clear();
    this.inverted.clear();
  }

  private addPostings(subjectId: CanonicalId, doc: IndexedDocument): void {
    for (const token of new Set(tokenize(doc.body.text))) {
      let set = this.inverted.get(token);
      if (!set) {
        set = new Set<CanonicalId>();
        this.inverted.set(token, set);
      }
      set.add(subjectId);
    }
  }

  private removePostings(subjectId: CanonicalId, doc: IndexedDocument): void {
    for (const token of new Set(tokenize(doc.body.text))) {
      const set = this.inverted.get(token);
      if (!set) continue;
      set.delete(subjectId);
      if (set.size === 0) this.inverted.delete(token);
    }
  }
}
