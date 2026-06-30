/** Content hashing for verifiable evidence (infrastructure adapter).
 * Matches the Asset Registry's Sha256ChecksumAdapter: raw hex digest. */
import { createHash } from 'node:crypto';

export function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function sha256(text: string): string {
  return createHash('sha256').update(bytes(text)).digest('hex');
}
