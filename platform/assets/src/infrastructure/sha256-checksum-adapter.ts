/**
 * SHA-256 ChecksumPort adapter (KMOS-0202 §15).
 *
 * Reference implementation backed by Node's built-in crypto. It uses only the
 * standard library (no third-party runtime dependency), matching the kernel's
 * own use of `node:crypto`. The registry depends on the ChecksumPort, not on
 * this concrete adapter.
 */

import { createHash } from 'node:crypto';
import type { ChecksumPort } from '../domain/checksum-port.js';

export class Sha256ChecksumAdapter implements ChecksumPort {
  readonly algorithm = 'sha256';

  compute(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
}
