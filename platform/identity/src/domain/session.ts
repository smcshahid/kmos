/**
 * Session domain model (KMOS-0206 §10).
 *
 * A Session is the artefact of a successful authentication: it binds an
 * authenticated identity to a time-bounded credential of platform access. It is
 * a canonical object owned by the Identity Service so that the fact of "who was
 * authenticated, when" is itself first-class and auditable.
 */

import {
  createCanonicalObject,
  newCanonicalId,
  type CanonicalId,
  type CanonicalObject,
} from '@kmos/canonical-kernel';

export interface SessionBody {
  readonly identityId: CanonicalId;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revoked: boolean;
}

export type SessionObject = CanonicalObject<SessionBody>;

export function makeSession(
  identityId: CanonicalId,
  issuedAt: string,
  expiresAt: string,
  organizationId?: CanonicalId,
): SessionObject {
  return createCanonicalObject<SessionBody>({
    id: newCanonicalId('Session'),
    type: 'Session',
    schemaVersion: '1.0',
    owner: 'IdentityService',
    lifecycle: 'Active',
    ...(organizationId !== undefined ? { organizationId } : {}),
    body: { identityId, issuedAt, expiresAt, revoked: false },
    now: issuedAt,
  });
}

/** True if the session is valid (not revoked, not expired) at `nowMs`. */
export function isSessionValid(s: SessionObject, nowMs: number): boolean {
  return !s.body.revoked && nowMs < Date.parse(s.body.expiresAt);
}
