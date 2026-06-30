/**
 * Storage PORT (KMOS-0202 §6/§17; constitution §2 ports-and-adapters).
 *
 * The Asset Registry manages Assets; storage systems store bytes — these are
 * different responsibilities (KMOS-0202 §6). The registry depends only on this
 * port and references logical storage ids; it never imports a concrete backend.
 * Adapters (object storage, filesystem, archive, content-addressable, ...) live
 * in `infrastructure/` and implement this interface, so the system of record
 * (the registry) is independent of storage technology (KMOS-0202 §17).
 *
 * NOTE: this port intentionally lives in `domain/` because it is a contract the
 * application core depends on; the *implementations* live in `infrastructure/`.
 */

/** Opaque stored content. The registry treats payloads as bytes only. */
export interface StoredContent {
  readonly bytes: Uint8Array;
}

/**
 * A logical, replaceable storage backend. `put`/`get`/`exists` operate on a
 * logical storage id; the adapter decides how that maps to physical bytes.
 */
export interface StoragePort {
  /** Persist content under a logical id (idempotent overwrite of that id). */
  put(storageId: string, content: StoredContent): Promise<void>;
  /** Retrieve content by logical id, or undefined if absent. */
  get(storageId: string): Promise<StoredContent | undefined>;
  /** Whether a logical id currently resolves to content. */
  exists(storageId: string): Promise<boolean>;
}
