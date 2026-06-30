/**
 * In-memory echo SecretResolver adapter (KMOS-0209 §5, KMOS-0190).
 *
 * A development/test adapter that maps SecretReference pointers to clear values
 * held in memory. Production replaces this with a Vault/KMS adapter behind the
 * same SecretResolver port; no caller changes. Clear values live ONLY here and
 * are never written into a ConfigurationVersion.
 */

import type { SecretResolver } from '../domain/secret-resolver.js';
import type { SecretReference } from '../domain/model.js';

export class EchoSecretResolver implements SecretResolver {
  private readonly values = new Map<string, string>();

  /** Construct from an optional ref -> clear-value seed map. */
  constructor(seed: Readonly<Record<string, string>> = {}) {
    for (const [ref, value] of Object.entries(seed)) this.values.set(ref, value);
  }

  /** Register (or overwrite) the clear value behind a secret reference. */
  set(ref: string, value: string): void {
    this.values.set(ref, value);
  }

  resolve(ref: SecretReference): string | undefined {
    return this.values.get(ref.secret);
  }
}
