/**
 * Environment-backed SecretResolver adapter (KMOS-0209 §5, KMOS-0190).
 *
 * A REAL, production-usable secret source for the common "secrets as environment
 * variables" deployment (12-factor, Kubernetes Secrets mounted as env, Docker
 * `--env-file`, systemd `EnvironmentFile`). It resolves a `SecretReference` to a
 * clear value read from the process environment (or an injected map, for tests)
 * — clear values are NEVER persisted into a ConfigurationVersion (the service
 * stores only the reference). A Vault/cloud-KMS adapter implements the same
 * `SecretResolver` port later with no caller change.
 *
 * Mapping is deterministic: a reference path is normalized to an upper-snake env
 * var under a prefix, e.g. with the default prefix `KMOS_SECRET_`:
 *   "secret://vault/db/password" -> KMOS_SECRET_VAULT_DB_PASSWORD
 *   "db/password"                -> KMOS_SECRET_DB_PASSWORD
 */

import type { SecretResolver } from '../domain/secret-resolver.js';
import type { SecretReference } from '../domain/model.js';

export interface EnvSecretResolverOptions {
  /** Env var prefix (default `KMOS_SECRET_`). */
  readonly prefix?: string;
  /** Environment map (default `process.env`); injectable for tests. */
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export class EnvSecretResolver implements SecretResolver {
  private readonly prefix: string;
  private readonly env: Readonly<Record<string, string | undefined>>;

  constructor(options: EnvSecretResolverOptions = {}) {
    this.prefix = options.prefix ?? 'KMOS_SECRET_';
    this.env = options.env ?? process.env;
  }

  /** The environment variable name a reference resolves to (deterministic). */
  envVarName(ref: SecretReference): string {
    const path = ref.secret.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''); // strip a scheme://
    const norm = path
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${this.prefix}${norm}`;
  }

  resolve(ref: SecretReference): string | undefined {
    return this.env[this.envVarName(ref)];
  }
}
