/**
 * Checksum PORT (KMOS-0202 §15; constitution §2/§6).
 *
 * Integrity verification recomputes a content checksum and compares it to the
 * recorded one. Hashing is non-deterministic infrastructure with respect to the
 * domain core (it reads bytes), so it is expressed as a port: the application
 * core asks "what is the checksum of these bytes?" and an adapter answers. This
 * keeps the registry free of any specific hashing library and lets a stronger
 * algorithm be swapped in behind the same interface.
 */

export interface ChecksumPort {
  /** Stable algorithm name recorded on IntegrityRecords, e.g. "sha256". */
  readonly algorithm: string;
  /** Compute the checksum of the given bytes. */
  compute(bytes: Uint8Array): string;
}
