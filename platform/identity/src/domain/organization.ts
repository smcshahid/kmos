/**
 * Organization domain model (KMOS-0206 §6, KMOS-0009 multi-tenancy).
 *
 * Organizations are first-class canonical objects representing an administrative
 * boundary / tenant. Identities, roles and delegations are scoped to an
 * organization, so authorization decisions can be tenant-aware.
 */

import {
  createCanonicalObject,
  newCanonicalId,
  type CanonicalObject,
} from '@kmos/canonical-kernel';

export interface OrganizationBody {
  readonly name: string;
}

export type OrganizationObject = CanonicalObject<OrganizationBody>;

/** Construct a canonical Organization object owned by the Identity Service. */
export function makeOrganization(name: string, now?: string): OrganizationObject {
  return createCanonicalObject<OrganizationBody>({
    id: newCanonicalId('Organization'),
    type: 'Organization',
    schemaVersion: '1.0',
    owner: 'IdentityService',
    lifecycle: 'Active',
    displayName: name,
    body: { name },
    ...(now !== undefined ? { now } : {}),
  });
}
