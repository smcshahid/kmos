/**
 * Authentication port + in-memory adapter (KMOS-0206 §10; ports-and-adapters).
 *
 * Credential verification is an infrastructure concern: in production it is
 * backed by an external IdP / secret store, so it lives behind a PORT. The
 * application core depends only on the AuthenticationPort interface and never on
 * a concrete credential store. This in-memory adapter is the
 * modular-monolith-first implementation, swappable for an OIDC/LDAP/secret-vault
 * adapter without changing the service.
 *
 * The port deliberately exposes only a boolean verification; it returns no
 * secrets and performs no policy. Issuing a Session and emitting audit events is
 * the application's job, keeping authn (who you are) separate from authz.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';

/** Verifies a presented credential for a given identity. */
export interface AuthenticationPort {
  /** Register/replace the credential secret for an identity. */
  setCredential(identityId: CanonicalId, secret: string): void;
  /** True iff `secret` matches the stored credential for `identityId`. */
  verify(identityId: CanonicalId, secret: string): boolean;
  /** True iff a credential is registered for `identityId`. */
  has(identityId: CanonicalId): boolean;
}

/** In-memory credential adapter. Stores secrets opaquely; never logs them. */
export class InMemoryAuthenticationAdapter implements AuthenticationPort {
  private readonly secrets = new Map<CanonicalId, string>();

  setCredential(identityId: CanonicalId, secret: string): void {
    this.secrets.set(identityId, secret);
  }

  verify(identityId: CanonicalId, secret: string): boolean {
    const stored = this.secrets.get(identityId);
    return stored !== undefined && stored === secret;
  }

  has(identityId: CanonicalId): boolean {
    return this.secrets.has(identityId);
  }
}
