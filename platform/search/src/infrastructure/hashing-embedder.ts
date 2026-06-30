/**
 * Deterministic hashing Embedder adapter (KMOS-0208 §5).
 *
 * A model-free stub: tokens are hashed into a fixed-dimension bag-of-tokens
 * vector, then L2-normalized. Deterministic and IO-free, so projections and
 * replay reproduce identical vectors (constitution §6). A real embedding-model
 * adapter implements the same Embedder port later, behind the adapter boundary.
 */

import type { Embedder } from '../domain/ports.js';
import { tokenize } from '../domain/ranking.js';

const DEFAULT_DIMENSION = 64;

/** Deterministic FNV-1a 32-bit hash of a string. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit FNV prime multiply (kept in unsigned range).
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export class HashingEmbedder implements Embedder {
  readonly dimension: number;

  constructor(dimension: number = DEFAULT_DIMENSION) {
    this.dimension = dimension;
  }

  embed(text: string): readonly number[] {
    const vec = new Array<number>(this.dimension).fill(0);
    for (const token of tokenize(text)) {
      const h = fnv1a(token);
      const bucket = h % this.dimension;
      // Sign from a second hash bit so collisions can cancel (signed hashing).
      const sign = (h & 0x80000000) !== 0 ? -1 : 1;
      vec[bucket] = (vec[bucket] ?? 0) + sign;
    }
    // L2-normalize for stable cosine similarity.
    let norm = 0;
    for (const v of vec) norm += v * v;
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }
}
