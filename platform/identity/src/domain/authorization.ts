/**
 * Role, Permission and Delegation domain model + authorization policy
 * (KMOS-0206 §7/§8/§9).
 *
 * Roles are business-oriented (Archivist, Editor, Publisher, Reviewer, ...).
 * Permissions are explicit capabilities (Approve Knowledge, Publish Assets,
 * Execute Workflow, ...). A Role bundles permissions; an Identity may also be
 * granted permissions directly. Delegation lets one identity temporarily act
 * with another's scope, and is auditable and time-bounded.
 *
 * The authorization decision is intentionally explicit and explainable: the
 * policy returns a structured decision listing the reason it allowed or denied,
 * so callers (and auditors) can see exactly why access was granted.
 */

import {
  createCanonicalObject,
  newCanonicalId,
  type CanonicalId,
  type CanonicalObject,
} from '@kmos/canonical-kernel';

export interface PermissionBody {
  /** Stable machine name, e.g. "knowledge.approve". */
  readonly name: string;
}

export type PermissionObject = CanonicalObject<PermissionBody>;

export function makePermission(name: string, displayName?: string, now?: string): PermissionObject {
  return createCanonicalObject<PermissionBody>({
    id: newCanonicalId('Permission'),
    type: 'Permission',
    schemaVersion: '1.0',
    owner: 'IdentityService',
    lifecycle: 'Active',
    ...(displayName !== undefined ? { displayName } : { displayName: name }),
    body: { name },
    ...(now !== undefined ? { now } : {}),
  });
}

export interface RoleBody {
  readonly name: string;
  /** Canonical Permission ids bundled by this role. */
  readonly permissionIds: readonly CanonicalId[];
}

export type RoleObject = CanonicalObject<RoleBody>;

export function makeRole(
  name: string,
  permissionIds: readonly CanonicalId[],
  now?: string,
): RoleObject {
  return createCanonicalObject<RoleBody>({
    id: newCanonicalId('Role'),
    type: 'Role',
    schemaVersion: '1.0',
    owner: 'IdentityService',
    lifecycle: 'Active',
    displayName: name,
    body: { name, permissionIds: [...permissionIds] },
    ...(now !== undefined ? { now } : {}),
  });
}

export interface DelegationBody {
  /** Identity granting its authority. */
  readonly delegatingId: CanonicalId;
  /** Identity receiving the delegated authority. */
  readonly receivingId: CanonicalId;
  /** Permission names this delegation conveys ('*' conveys all of the delegator's authority). */
  readonly scope: readonly string[];
  /** Human-facing reason, retained for audit. */
  readonly reason: string;
  /** ISO-8601 instant the delegation becomes effective. */
  readonly grantedAt: string;
  /** ISO-8601 instant the delegation expires. */
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export type DelegationObject = CanonicalObject<DelegationBody>;

/** True if the delegation is currently active at `nowMs` (effective, not expired, not revoked). */
export function isDelegationActive(d: DelegationObject, nowMs: number): boolean {
  if (d.body.revoked) return false;
  const granted = Date.parse(d.body.grantedAt);
  const expires = Date.parse(d.body.expiresAt);
  return nowMs >= granted && nowMs < expires;
}

/** True if a delegation scope conveys the named permission. */
export function delegationConveys(d: DelegationObject, permission: string): boolean {
  return d.body.scope.includes('*') || d.body.scope.includes(permission);
}
