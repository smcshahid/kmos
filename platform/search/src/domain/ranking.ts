/**
 * Pure ranking primitives for Search & Discovery (KMOS-0208 §3).
 *
 * Deterministic, infrastructure-free functions (constitution §1/§6):
 *  - tokenize        : lowercase word tokens
 *  - bm25Score       : keyword relevance (TF/IDF with length normalization)
 *  - cosineSimilarity: vector similarity
 *  - reciprocalRankFusion: fuse keyword + vector rankings (RRF, k=60)
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { IndexStore } from './ports.js';

/** Split text into lowercase alphanumeric tokens. */
export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g);
  return matches ?? [];
}

/** Reciprocal Rank Fusion constant (KMOS-0208 §3 / Readiness Report §7.6). */
export const RRF_K = 60;

/**
 * BM25-style score of a document's text against the query tokens. Uses classic
 * BM25 with k1=1.5, b=0.75, computing IDF from the store's document frequencies.
 * Returns 0 when no query token matches.
 */
export function bm25Score(
  queryTokens: readonly string[],
  docTokens: readonly string[],
  store: IndexStore,
  avgDocLength: number,
  totalDocs: number,
): number {
  const k1 = 1.5;
  const b = 0.75;
  const docLen = docTokens.length;
  if (docLen === 0) return 0;

  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  let score = 0;
  for (const term of new Set(queryTokens)) {
    const f = tf.get(term);
    if (!f) continue;
    const n = store.docFrequency(term);
    // BM25 IDF (with +1 to stay non-negative for common terms).
    const idf = Math.log(1 + (totalDocs - n + 0.5) / (n + 0.5));
    const denom = f + k1 * (1 - b + (b * docLen) / (avgDocLength || 1));
    score += idf * ((f * (k1 + 1)) / denom);
  }
  return score;
}

/** Cosine similarity of two equal-length vectors; 0 if either is a zero vector. */
export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** A ranked list of subject ids (best first), as produced by one ranker. */
export type RankedList = readonly CanonicalId[];

/**
 * Reciprocal Rank Fusion: combine several ranked lists into one fused score per
 * subject id. score(d) = sum over lists of 1 / (k + rank(d)), rank is 1-based.
 * Returns a map subjectId -> fused score (only ids that appeared in some list).
 */
export function reciprocalRankFusion(
  lists: readonly RankedList[],
  k: number = RRF_K,
): Map<CanonicalId, number> {
  const fused = new Map<CanonicalId, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i];
      if (id === undefined) continue;
      const rank = i + 1;
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return fused;
}
