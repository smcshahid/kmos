/**
 * Identity domain model (KMOS-0206 §5, KMOS-10030 §12).
 *
 * The Identity Service owns the canonical identity of every actor in KMOS —
 * human AND non-human. Non-human actors (platform services, applications,
 * capabilities, AI workers, connectors, automation) are first-class identities
 * and are NEVER anonymous: every fact in the platform is attributable to a
 * canonical identity.
 *
 * Identities are canonical objects owned by 'IdentityService'. Sessions,
 * ServiceAccounts and AutomationAccounts are modelled as Identity subtypes via
 * the discriminating `kind`, exactly as the spec requires.
 */

import {
  createCanonicalObject,
  newCanonicalId,
  type CanonicalId,
  type CanonicalObject,
} from '@kmos/canonical-kernel';

/**
 * The actor kinds the Identity Service must represent. Humans and organizations
 * are administrative actors; the remaining kinds are non-human actors that act
 * on the platform under their own canonical identity.
 */
export const IDENTITY_KINDS = [
  'Human',
  'Organization',
  'Application',
  'PlatformService',
  'Capability',
  'AiWorker',
  'Connector',
  'Automation',
  'ServiceAccount',
] as const;

export type IdentityKind = (typeof IDENTITY_KINDS)[number];

/** Kinds that represent non-human actors (used for first-class, never-anonymous checks). */
const NON_HUMAN_KINDS: ReadonlySet<IdentityKind> = new Set<IdentityKind>([
  'Application',
  'PlatformService',
  'Capability',
  'AiWorker',
  'Connector',
  'Automation',
  'ServiceAccount',
]);

export function isNonHumanKind(kind: IdentityKind): boolean {
  return NON_HUMAN_KINDS.has(kind);
}

export interface IdentityBody {
  readonly kind: IdentityKind;
  /** Roles assigned to this identity (canonical Role ids). */
  readonly roleIds: readonly CanonicalId[];
  /** Permissions granted directly to this identity (canonical Permission ids). */
  readonly permissionIds: readonly CanonicalId[];
  /** True once the identity has been disabled/retired and may no longer act. */
  readonly active: boolean;
}

export type IdentityObject = CanonicalObject<IdentityBody>;

export interface NewIdentityInput {
  readonly kind: IdentityKind;
  readonly displayName: string;
  readonly organizationId?: CanonicalId;
  readonly now?: string;
}

/** Construct a canonical Identity object owned by the Identity Service. */
export function makeIdentity(input: NewIdentityInput): IdentityObject {
  return createCanonicalObject<IdentityBody>({
    id: newCanonicalId('Identity'),
    type: 'Identity',
    schemaVersion: '1.0',
    owner: 'IdentityService',
    lifecycle: 'Active',
    displayName: input.displayName,
    ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    body: { kind: input.kind, roleIds: [], permissionIds: [], active: true },
    ...(input.now !== undefined ? { now: input.now } : {}),
  });
}
