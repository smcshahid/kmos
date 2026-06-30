/**
 * In-memory StoragePort adapter (KMOS-0202 §17; modular-monolith-first).
 *
 * The reference implementation of the storage port. It models a logical
 * key/value object store with zero runtime dependencies. A real adapter
 * (S3/MinIO, filesystem, tape archive, CAS) implements the same StoragePort
 * without changing the registry, proving storage is never the system of record.
 *
 * `migrate` simulates a storage migration: it copies the bytes to a new logical
 * id and (optionally) drops the old one. The registry can then repoint an
 * Asset's storage reference WITHOUT changing the Asset's canonical identity.
 */

import type { StoragePort, StoredContent } from '../domain/storage-port.js';

export class InMemoryStorageAdapter implements StoragePort {
  private readonly objects = new Map<string, Uint8Array>();

  async put(storageId: string, content: StoredContent): Promise<void> {
    this.objects.set(storageId, content.bytes.slice());
  }

  async get(storageId: string): Promise<StoredContent | undefined> {
    const bytes = this.objects.get(storageId);
    return bytes === undefined ? undefined : { bytes: bytes.slice() };
  }

  async exists(storageId: string): Promise<boolean> {
    return this.objects.has(storageId);
  }

  /** Simulate a storage migration: copy bytes to a new logical id. */
  async migrate(fromStorageId: string, toStorageId: string, dropSource = true): Promise<void> {
    const bytes = this.objects.get(fromStorageId);
    if (bytes === undefined) {
      throw new Error(`Cannot migrate missing storage id: ${fromStorageId}`);
    }
    this.objects.set(toStorageId, bytes.slice());
    if (dropSource && fromStorageId !== toStorageId) this.objects.delete(fromStorageId);
  }

  /** Number of logical objects currently stored (diagnostics/tests). */
  size(): number {
    return this.objects.size;
  }
}
