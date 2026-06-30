/**
 * Capability Registry domain model (KMOS-0205, KMOS-0120, KMOS-0160).
 *
 * A Capability is a permanent business ability with a stable identity across
 * implementation upgrades. Each version has a machine-readable manifest and a
 * business contract. The Registry catalogs ABILITIES, not runtime infrastructure.
 */

import type { CanonicalId, CanonicalObject, Schema } from '@kmos/canonical-kernel';

export const CAPABILITY_LIFECYCLE = [
  'Proposed',
  'Experimental',
  'Prototype',
  'Verified',
  'Certified',
  'Production',
  'Deprecated',
  'Archived',
] as const;
export type CapabilityLifecycle = (typeof CAPABILITY_LIFECYCLE)[number];

export const CERTIFICATION_LEVELS = [
  'Experimental',
  'Development',
  'Verified',
  'Production',
  'Enterprise',
  'Reference',
] as const;
export type CertificationLevel = (typeof CERTIFICATION_LEVELS)[number];

/** Stable business contract for a capability version (KMOS-0120 §7). */
export interface CapabilityContract {
  readonly acceptedObjects: readonly string[];
  readonly producedObjects: readonly string[];
  readonly consumedEvents: readonly string[];
  readonly publishedEvents: readonly string[];
  readonly preconditions?: readonly string[];
  readonly postconditions?: readonly string[];
  readonly errorConditions?: readonly string[];
}

/** Machine-readable manifest for a capability version (KMOS-0120 §6, KMOS-0160 §7). */
export interface CapabilityManifestBody {
  readonly capabilityId: CanonicalId;
  readonly name: string;
  readonly businessPurpose: string;
  readonly ownerDomain: string;
  readonly version: string; // semver
  readonly inputs: readonly string[];
  readonly outputs: readonly string[];
  readonly contract: CapabilityContract;
  /** Capability ids this version depends on (KMOS-0120 §11; explicit only). */
  readonly dependencies: readonly CanonicalId[];
  readonly configurationSchema?: Schema;
  readonly securityRequirements?: readonly string[];
}

export interface CapabilityBody {
  readonly name: string;
  readonly ownerDomain: string;
  readonly businessPurpose: string;
  readonly currentVersion: string;
  readonly lifecycleState: CapabilityLifecycle;
  readonly certification?: CertificationLevel;
}

export interface CapabilityCertificationBody {
  readonly capabilityId: CanonicalId;
  readonly version: string;
  readonly level: CertificationLevel;
  readonly authority: string;
  readonly grantedAt: string;
  readonly revoked?: boolean;
}

export type CapabilityObject = CanonicalObject<CapabilityBody>;
export type CapabilityManifestObject = CanonicalObject<CapabilityManifestBody>;
export type CapabilityCertificationObject = CanonicalObject<CapabilityCertificationBody>;

/** Parse a semver string into comparable parts; throws on malformed input. */
export function parseSemver(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`Invalid semver: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] as number) - (pb[i] as number);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}
