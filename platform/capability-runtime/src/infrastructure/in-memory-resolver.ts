/**
 * In-memory CapabilityResolver adapter (modular-monolith-first; a
 * registry-backed adapter can replace it without touching the coordinator).
 *
 * Handlers are registered by capabilityId + version. The "active" version for a
 * capability id is the most recently registered one, mirroring how the runtime
 * activates a freshly-registered implementation (KMOS-0160 §19).
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type {
  CapabilityHandler,
  CapabilityResolver,
  ResolvedHandler,
} from '../domain/ports.js';

export class InMemoryCapabilityResolver implements CapabilityResolver {
  /** capabilityId -> (version -> handler). */
  private readonly byCapability = new Map<CanonicalId, Map<string, CapabilityHandler>>();
  /** capabilityId -> active version. */
  private readonly active = new Map<CanonicalId, string>();

  register(capabilityId: CanonicalId, version: string, handler: CapabilityHandler): void {
    const byVersion = this.byCapability.get(capabilityId) ?? new Map<string, CapabilityHandler>();
    byVersion.set(version, handler);
    this.byCapability.set(capabilityId, byVersion);
    // Registering a version activates it (latest-wins activation).
    this.active.set(capabilityId, version);
  }

  resolve(capabilityId: CanonicalId, version?: string): ResolvedHandler | undefined {
    const byVersion = this.byCapability.get(capabilityId);
    if (byVersion === undefined) return undefined;
    const resolvedVersion = version ?? this.active.get(capabilityId);
    if (resolvedVersion === undefined) return undefined;
    const handler = byVersion.get(resolvedVersion);
    if (handler === undefined) return undefined;
    return { capabilityId, version: resolvedVersion, handler };
  }

  activeVersion(capabilityId: CanonicalId): string | undefined {
    return this.active.get(capabilityId);
  }
}
