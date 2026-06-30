/**
 * Stub ConfigurationPort adapter (KMOS-0160 §9).
 *
 * Holds externalized configuration in memory, keyed by capabilityId + version.
 * No business configuration is baked into the runtime; a Configuration-Service-
 * backed adapter can replace this without changing the coordinator. With no
 * entries it resolves to an empty configuration, which is the conformant
 * default.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { ConfigurationPort } from '../domain/ports.js';

export class StaticConfigurationPort implements ConfigurationPort {
  private readonly byKey = new Map<string, Readonly<Record<string, unknown>>>();

  private key(capabilityId: CanonicalId, version: string): string {
    return `${capabilityId}@${version}`;
  }

  /** Set the externalized configuration for a capability id + version. */
  set(
    capabilityId: CanonicalId,
    version: string,
    configuration: Readonly<Record<string, unknown>>,
  ): void {
    this.byKey.set(this.key(capabilityId, version), configuration);
  }

  resolve(
    capabilityId: CanonicalId,
    version: string,
  ): Readonly<Record<string, unknown>> | undefined {
    return this.byKey.get(this.key(capabilityId, version));
  }
}
