/**
 * SecretResolver port (KMOS-0209 §5, KMOS-0190).
 *
 * Secrets are referenced, never stored in the clear. The Configuration Service
 * persists only a SecretReference pointer; the clear value is fetched on demand
 * through this port. Production adapters (Vault, cloud KMS) live in
 * `infrastructure/`; the domain depends on the interface only.
 */

import type { SecretReference } from './model.js';

export interface SecretResolver {
  /** Resolve a SecretReference to its clear value, or undefined if unknown. */
  resolve(ref: SecretReference): string | undefined;
}
