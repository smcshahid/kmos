/**
 * Configuration Service domain model (KMOS-0209, KMOS-0160 §9, KMOS-0190).
 *
 * The Configuration Service owns four canonical objects:
 *  - ConfigurationSet      : a named, scoped namespace of configuration keys.
 *  - ConfigurationVersion  : an immutable snapshot of a set's values; a new
 *                            version is created on every change, never mutated.
 *  - ConfigurationProfile  : a named environment (e.g. dev/staging/prod) whose
 *                            overrides take precedence over the set defaults.
 *  - SecretReference       : a pointer (e.g. "secret://vault/db/password") to a
 *                            secret held outside KMOS. The clear value is NEVER
 *                            stored; it is resolved on demand via a port.
 *
 * The domain core holds canonical types and pure rules only. It imports nothing
 * from infrastructure (ports-and-adapters; KMOS coding constitution §2).
 */

import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';

/** Scope a configuration set governs (KMOS-0209 §3). */
export const CONFIGURATION_SCOPES = ['platform', 'service', 'capability', 'extension'] as const;
export type ConfigurationScope = (typeof CONFIGURATION_SCOPES)[number];

/**
 * A reference to a secret stored outside KMOS. Only the reference is persisted;
 * the clear value is resolved through the SecretResolver port (KMOS-0190).
 */
export interface SecretReference {
  readonly secret: string; // e.g. "secret://vault/db/password"
}

/** A configuration value: a plain JSON value or an (unresolved) secret reference. */
export type ConfigurationValue =
  | string
  | number
  | boolean
  | null
  | SecretReference
  | readonly ConfigurationValue[]
  | { readonly [key: string]: ConfigurationValue };

/** Type guard: is this value a SecretReference (a pointer, never a clear secret)? */
export function isSecretReference(value: unknown): value is SecretReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { secret?: unknown }).secret === 'string' &&
    // a SecretReference has exactly the single `secret` key
    Object.keys(value as object).length === 1
  );
}

/** Body of a ConfigurationSet canonical object. */
export interface ConfigurationSetBody {
  readonly scope: ConfigurationScope;
  /** Key namespace this set governs (e.g. "asset-registry", "platform.core"). */
  readonly namespace: string;
  /** Id of the current (latest) ConfigurationVersion, if any values have been set. */
  readonly currentVersionId?: CanonicalId;
  /** Monotonic count of versions created for this set. */
  readonly versionCount: number;
}

/**
 * Body of an immutable ConfigurationVersion. Each version snapshots the default
 * values for the set plus any per-profile overrides at the time of the change.
 * Secret values are stored only as SecretReference pointers.
 */
export interface ConfigurationVersionBody {
  readonly setId: CanonicalId;
  /** Monotonic version number within the set (1-based). */
  readonly versionNumber: number;
  /** Default key/value map for the set. */
  readonly values: Readonly<Record<string, ConfigurationValue>>;
  /** Per-profile override maps: profileName -> { key: value }. */
  readonly profiles: Readonly<Record<string, Readonly<Record<string, ConfigurationValue>>>>;
  /** Human-recorded reason for the change (governance/audit). */
  readonly reason: string;
}

/** Body of a ConfigurationProfile canonical object. */
export interface ConfigurationProfileBody {
  readonly setId: CanonicalId;
  readonly name: string; // e.g. "dev", "staging", "prod"
}

export type ConfigurationSetObject = CanonicalObject<ConfigurationSetBody>;
export type ConfigurationVersionObject = CanonicalObject<ConfigurationVersionBody>;
export type ConfigurationProfileObject = CanonicalObject<ConfigurationProfileBody>;
