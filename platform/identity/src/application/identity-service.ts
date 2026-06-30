/**
 * Identity Service (KMOS-0206): canonical identity, organizations, roles,
 * permissions, delegation, authentication and authorization.
 *
 * Responsibilities (KMOS-0206):
 *  - Own the canonical identity of HUMAN and NON-HUMAN actors. Non-human actors
 *    (service accounts, AI workers, connectors, automation) are first-class and
 *    are never anonymous.
 *  - Own Organizations (administrative boundary / tenant).
 *  - Own business Roles and Permissions; assign/revoke roles and grant/revoke
 *    permissions.
 *  - Own Delegations: auditable, time-bounded transfers of authority.
 *  - Authenticate identities via an AuthenticationPort, issuing Sessions and
 *    publishing AuthenticationSucceeded / AuthenticationFailed.
 *  - Make deterministic, explainable authorization decisions over roles,
 *    direct permissions, organization scope and active delegations.
 *
 * Every meaningful change publishes a canonical event through the kernel
 * EventBus. The bus is injected (default `new EventBus()`) and the clock is
 * injectable (`now`) for deterministic tests and replay.
 */

import {
  EventBus,
  KmosError,
  createEvent,
  newCanonicalId,
  type CanonicalEvent,
  type CanonicalId,
  type CanonicalObject,
  type StoredEvent,
} from '@kmos/canonical-kernel';

import {
  isNonHumanKind,
  makeIdentity,
  type IdentityKind,
  type IdentityObject,
} from '../domain/identity.js';
import { makeOrganization, type OrganizationObject } from '../domain/organization.js';
import {
  delegationConveys,
  isDelegationActive,
  makePermission,
  makeRole,
  type DelegationBody,
  type DelegationObject,
  type PermissionObject,
  type RoleObject,
} from '../domain/authorization.js';
import { isSessionValid, makeSession, type SessionObject } from '../domain/session.js';
import {
  InMemoryRepository,
  type CanonicalRepository,
} from '../infrastructure/repositories.js';
import {
  InMemoryAuthenticationAdapter,
  type AuthenticationPort,
} from '../infrastructure/authentication-port.js';

const PRODUCER = 'IdentityService';

export interface IdentityServiceOptions {
  /** Injected event bus; defaults to a fresh in-process bus. */
  readonly bus?: EventBus;
  /** Injected authentication port; defaults to the in-memory adapter. */
  readonly auth?: AuthenticationPort;
  /** Deterministic clock for events/objects; defaults to wall clock. */
  readonly now?: () => string;
  /** Default session lifetime in milliseconds (default 1 hour). */
  readonly sessionTtlMs?: number;
}

export interface CreateIdentityInput {
  readonly kind: IdentityKind;
  readonly displayName: string;
  readonly organizationId?: CanonicalId;
}

/** A structured, explainable authorization decision (KMOS-0206 §8). */
export interface AuthorizationDecision {
  readonly allowed: boolean;
  /** Machine-readable reason, e.g. "role:Editor", "direct-permission", "delegation". */
  readonly reason: string;
  readonly identityId: CanonicalId;
  readonly permission: string;
}

export interface AuthorizeQuery {
  readonly identityId: CanonicalId;
  readonly permission: string;
  readonly organizationId?: CanonicalId;
}

export class IdentityService {
  private readonly bus: EventBus;
  private readonly auth: AuthenticationPort;
  private readonly now: () => string;
  private readonly sessionTtlMs: number;

  private readonly identities: CanonicalRepository<IdentityObject> = new InMemoryRepository();
  private readonly organizations: CanonicalRepository<OrganizationObject> = new InMemoryRepository();
  private readonly roles: CanonicalRepository<RoleObject> = new InMemoryRepository();
  private readonly permissions: CanonicalRepository<PermissionObject> = new InMemoryRepository();
  private readonly delegations: CanonicalRepository<DelegationObject> = new InMemoryRepository();
  private readonly sessions: CanonicalRepository<SessionObject> = new InMemoryRepository();
  /** Permission name -> id, for resolving names in authorization. */
  private readonly permissionByName = new Map<string, CanonicalId>();

  constructor(options: IdentityServiceOptions = {}) {
    this.bus = options.bus ?? new EventBus();
    this.auth = options.auth ?? new InMemoryAuthenticationAdapter();
    this.now = options.now ?? (() => new Date().toISOString());
    this.sessionTtlMs = options.sessionTtlMs ?? 60 * 60 * 1000;
  }

  // --- event helpers -------------------------------------------------------

  private async emit<P extends object>(
    type: string,
    subjectId: CanonicalId,
    payload: P,
    organizationId?: CanonicalId,
    actorId?: CanonicalId,
  ): Promise<CanonicalEvent<P>> {
    const event = createEvent<P>({
      type,
      schemaVersion: '1.0',
      producer: PRODUCER,
      subjectId,
      payload,
      ...(organizationId !== undefined ? { organizationId } : {}),
      ...(actorId !== undefined ? { actorId } : {}),
      time: this.now(),
    });
    await this.bus.publish(event, { streamId: subjectId });
    return event;
  }

  private require<T extends CanonicalObject>(
    repo: CanonicalRepository<T>,
    id: CanonicalId,
    kind: string,
  ): T {
    const found = repo.get(id);
    if (found === undefined) {
      throw new KmosError(`${kind} not found`, {
        category: 'NotFound',
        code: `identity.${kind.toLowerCase()}.not_found`,
        subject: id,
      });
    }
    return found;
  }

  // --- identities ----------------------------------------------------------

  /**
   * Create a canonical identity for any actor kind (human or non-human).
   * Non-human identities are first-class and never anonymous: they must carry a
   * non-empty display name so every fact remains attributable.
   */
  async createIdentity(input: CreateIdentityInput): Promise<IdentityObject> {
    if (input.displayName.trim() === '') {
      throw new KmosError('Identity requires a non-empty display name', {
        category: 'Validation',
        code: 'identity.displayName.required',
        detail: { kind: input.kind },
      });
    }
    if (input.organizationId !== undefined && !this.organizations.has(input.organizationId)) {
      throw new KmosError('Unknown organization for identity', {
        category: 'NotFound',
        code: 'identity.organization.not_found',
        subject: input.organizationId,
      });
    }
    const identity = makeIdentity({
      kind: input.kind,
      displayName: input.displayName,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      now: this.now(),
    });
    this.identities.put(identity);

    await this.emit(
      'IdentityCreated',
      identity.id,
      { identityId: identity.id, kind: identity.body.kind, displayName: input.displayName },
      input.organizationId,
      identity.id,
    );

    // Non-human actors are also recorded as service accounts in the catalogue of
    // automation principals, so they are explicitly first-class (KMOS-0206 §5).
    if (isNonHumanKind(input.kind)) {
      await this.emit(
        'ServiceAccountRegistered',
        identity.id,
        { identityId: identity.id, kind: identity.body.kind },
        input.organizationId,
        identity.id,
      );
    }
    return identity;
  }

  /** Convenience: register a non-human service/automation account with a credential. */
  async registerServiceAccount(
    displayName: string,
    credential: string,
    kind: IdentityKind = 'ServiceAccount',
    organizationId?: CanonicalId,
  ): Promise<IdentityObject> {
    if (!isNonHumanKind(kind)) {
      throw new KmosError('Service accounts must be a non-human kind', {
        category: 'Validation',
        code: 'identity.serviceAccount.kind_invalid',
        detail: { kind },
      });
    }
    const identity = await this.createIdentity({
      kind,
      displayName,
      ...(organizationId !== undefined ? { organizationId } : {}),
    });
    this.auth.setCredential(identity.id, credential);
    return identity;
  }

  getIdentity(id: CanonicalId): IdentityObject | undefined {
    return this.identities.get(id);
  }

  // --- organizations -------------------------------------------------------

  async createOrganization(name: string): Promise<OrganizationObject> {
    const org = makeOrganization(name, this.now());
    this.organizations.put(org);
    await this.emit('IdentityCreated', org.id, { organizationId: org.id, name }, org.id, org.id);
    return org;
  }

  getOrganization(id: CanonicalId): OrganizationObject | undefined {
    return this.organizations.get(id);
  }

  // --- permissions & roles -------------------------------------------------

  createPermission(name: string, displayName?: string): PermissionObject {
    const perm = makePermission(name, displayName, this.now());
    this.permissions.put(perm);
    this.permissionByName.set(name, perm.id);
    return perm;
  }

  createRole(name: string, permissionIds: readonly CanonicalId[] = []): RoleObject {
    for (const pid of permissionIds) this.require(this.permissions, pid, 'Permission');
    const role = makeRole(name, permissionIds, this.now());
    this.roles.put(role);
    return role;
  }

  getRole(id: CanonicalId): RoleObject | undefined {
    return this.roles.get(id);
  }

  getPermission(id: CanonicalId): PermissionObject | undefined {
    return this.permissions.get(id);
  }

  // --- role assignment -----------------------------------------------------

  private nextVersion(obj: IdentityObject, body: IdentityObject['body']): IdentityObject {
    const updated: IdentityObject = {
      ...obj,
      version: obj.version + 1,
      updatedAt: this.now(),
      body,
    };
    this.identities.put(updated);
    return updated;
  }

  async assignRole(identityId: CanonicalId, roleId: CanonicalId): Promise<IdentityObject> {
    const identity = this.require(this.identities, identityId, 'Identity');
    this.require(this.roles, roleId, 'Role');
    if (identity.body.roleIds.includes(roleId)) return identity;
    const updated = this.nextVersion(identity, {
      ...identity.body,
      roleIds: [...identity.body.roleIds, roleId],
    });
    await this.emit('RoleAssigned', identityId, { identityId, roleId }, identity.organizationId, identityId);
    return updated;
  }

  async revokeRole(identityId: CanonicalId, roleId: CanonicalId): Promise<IdentityObject> {
    const identity = this.require(this.identities, identityId, 'Identity');
    if (!identity.body.roleIds.includes(roleId)) return identity;
    const updated = this.nextVersion(identity, {
      ...identity.body,
      roleIds: identity.body.roleIds.filter((r) => r !== roleId),
    });
    await this.emit('RoleAssigned', identityId, { identityId, roleId, revoked: true }, identity.organizationId, identityId);
    return updated;
  }

  // --- direct permission grants -------------------------------------------

  async grantPermission(identityId: CanonicalId, permissionId: CanonicalId): Promise<IdentityObject> {
    const identity = this.require(this.identities, identityId, 'Identity');
    this.require(this.permissions, permissionId, 'Permission');
    if (identity.body.permissionIds.includes(permissionId)) return identity;
    const updated = this.nextVersion(identity, {
      ...identity.body,
      permissionIds: [...identity.body.permissionIds, permissionId],
    });
    await this.emit('PermissionGranted', identityId, { identityId, permissionId }, identity.organizationId, identityId);
    return updated;
  }

  async revokePermission(identityId: CanonicalId, permissionId: CanonicalId): Promise<IdentityObject> {
    const identity = this.require(this.identities, identityId, 'Identity');
    if (!identity.body.permissionIds.includes(permissionId)) return identity;
    const updated = this.nextVersion(identity, {
      ...identity.body,
      permissionIds: identity.body.permissionIds.filter((p) => p !== permissionId),
    });
    await this.emit('PermissionGranted', identityId, { identityId, permissionId, revoked: true }, identity.organizationId, identityId);
    return updated;
  }

  // --- delegation ----------------------------------------------------------

  /**
   * Delegate authority from `delegatingId` to `receivingId` for `scope` (a list
   * of permission names, or ['*'] for the delegator's full authority), expiring
   * after `durationMs`. Both identities must exist; the record is auditable and
   * retains the supplied reason.
   */
  async delegate(
    delegatingId: CanonicalId,
    receivingId: CanonicalId,
    scope: readonly string[],
    durationMs: number,
    reason: string,
  ): Promise<DelegationObject> {
    this.require(this.identities, delegatingId, 'Identity');
    const receiver = this.require(this.identities, receivingId, 'Identity');
    if (durationMs <= 0) {
      throw new KmosError('Delegation duration must be positive', {
        category: 'Validation',
        code: 'identity.delegation.duration_invalid',
        detail: { durationMs },
      });
    }
    const grantedAtIso = this.now();
    const expiresAtIso = new Date(Date.parse(grantedAtIso) + durationMs).toISOString();
    const body: DelegationBody = {
      delegatingId,
      receivingId,
      scope: [...scope],
      reason,
      grantedAt: grantedAtIso,
      expiresAt: expiresAtIso,
      revoked: false,
    };
    const delegation: DelegationObject = {
      id: newCanonicalId('Delegation'),
      type: 'Delegation',
      schemaVersion: '1.0',
      owner: 'IdentityService',
      version: 1,
      lifecycle: 'Active',
      createdAt: grantedAtIso,
      updatedAt: grantedAtIso,
      ...(receiver.organizationId !== undefined ? { organizationId: receiver.organizationId } : {}),
      relationships: [
        { relation: 'delegatedBy', targetId: delegatingId, targetType: 'Identity' },
        { relation: 'delegatedTo', targetId: receivingId, targetType: 'Identity' },
      ],
      governance: {},
      body,
    };
    this.delegations.put(delegation);
    await this.emit(
      'DelegationCreated',
      delegation.id,
      { delegationId: delegation.id, delegatingId, receivingId, scope: body.scope, expiresAt: expiresAtIso, reason },
      receiver.organizationId,
      delegatingId,
    );
    return delegation;
  }

  async revokeDelegation(delegationId: CanonicalId): Promise<DelegationObject> {
    const d = this.require(this.delegations, delegationId, 'Delegation');
    const updated: DelegationObject = {
      ...d,
      version: d.version + 1,
      updatedAt: this.now(),
      body: { ...d.body, revoked: true },
    };
    this.delegations.put(updated);
    await this.emit('DelegationCreated', delegationId, { delegationId, revoked: true }, d.organizationId, d.body.delegatingId);
    return updated;
  }

  /** All delegations currently active for the given receiving identity. */
  activeDelegationsFor(receivingId: CanonicalId): readonly DelegationObject[] {
    const nowMs = Date.parse(this.now());
    return this.delegations
      .list()
      .filter((d) => d.body.receivingId === receivingId && isDelegationActive(d, nowMs));
  }

  // --- authentication ------------------------------------------------------

  /**
   * Authenticate an identity by verifying its credential through the
   * AuthenticationPort. On success a Session is issued and
   * AuthenticationSucceeded is published; on failure AuthenticationFailed is
   * published and a KmosError (category 'Authentication') is thrown.
   */
  async authenticate(identityId: CanonicalId, credential: string): Promise<SessionObject> {
    const identity = this.identities.get(identityId);
    const fail = async (code: string, message: string): Promise<never> => {
      // Subject is the (claimed) identity id so the failure is still attributable.
      await this.emit('AuthenticationFailed', identityId, { identityId, reason: code }, identity?.organizationId, identityId);
      throw new KmosError(message, { category: 'Authentication', code, subject: identityId });
    };

    if (identity === undefined) {
      return fail('identity.authn.unknown_identity', 'Unknown identity');
    }
    if (!identity.body.active) {
      return fail('identity.authn.inactive', 'Identity is not active');
    }
    if (!this.auth.verify(identityId, credential)) {
      return fail('identity.authn.bad_credential', 'Invalid credential');
    }

    const issuedAt = this.now();
    const expiresAt = new Date(Date.parse(issuedAt) + this.sessionTtlMs).toISOString();
    const session = makeSession(identityId, issuedAt, expiresAt, identity.organizationId);
    this.sessions.put(session);
    await this.emit(
      'AuthenticationSucceeded',
      identityId,
      { identityId, sessionId: session.id, expiresAt },
      identity.organizationId,
      identityId,
    );
    return session;
  }

  /** True if the session exists and is currently valid (not revoked, not expired). */
  validateSession(sessionId: CanonicalId): boolean {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return false;
    return isSessionValid(session, Date.parse(this.now()));
  }

  getSession(id: CanonicalId): SessionObject | undefined {
    return this.sessions.get(id);
  }

  // --- authorization -------------------------------------------------------

  /** Resolve the permission names an identity holds directly or via its roles. */
  private directPermissionNames(identity: IdentityObject): Set<string> {
    const names = new Set<string>();
    for (const pid of identity.body.permissionIds) {
      const p = this.permissions.get(pid);
      if (p) names.add(p.body.name);
    }
    for (const rid of identity.body.roleIds) {
      const role = this.roles.get(rid);
      if (!role) continue;
      for (const pid of role.body.permissionIds) {
        const p = this.permissions.get(pid);
        if (p) names.add(p.body.name);
      }
    }
    return names;
  }

  /**
   * Deterministic, explainable authorization decision. Considers (in order): the
   * identity being active, organization scope, the identity's roles and direct
   * permissions, then active (non-expired) delegations whose delegator holds the
   * permission. Returns a structured decision; `authorize` is the boolean form.
   */
  decide(query: AuthorizeQuery): AuthorizationDecision {
    const base = { identityId: query.identityId, permission: query.permission } as const;
    const identity = this.identities.get(query.identityId);
    if (identity === undefined) {
      return { ...base, allowed: false, reason: 'unknown-identity' };
    }
    if (!identity.body.active) {
      return { ...base, allowed: false, reason: 'identity-inactive' };
    }
    if (
      query.organizationId !== undefined &&
      identity.organizationId !== undefined &&
      identity.organizationId !== query.organizationId
    ) {
      return { ...base, allowed: false, reason: 'organization-mismatch' };
    }

    // Direct + role-derived permissions.
    if (this.directPermissionNames(identity).has(query.permission)) {
      return { ...base, allowed: true, reason: 'direct-or-role' };
    }

    // Active delegations: the receiver inherits a permission iff the delegation
    // scope conveys it AND the delegator actually holds it (no privilege escalation).
    const nowMs = Date.parse(this.now());
    for (const d of this.delegations.list()) {
      if (d.body.receivingId !== query.identityId) continue;
      if (!isDelegationActive(d, nowMs)) continue;
      if (!delegationConveys(d, query.permission)) continue;
      const delegator = this.identities.get(d.body.delegatingId);
      if (delegator && this.directPermissionNames(delegator).has(query.permission)) {
        return { ...base, allowed: true, reason: `delegation:${d.id}` };
      }
    }

    return { ...base, allowed: false, reason: 'no-grant' };
  }

  /** Boolean authorization decision (KMOS-0206 §8). */
  authorize(query: AuthorizeQuery): boolean {
    return this.decide(query).allowed;
  }

  // --- introspection / audit ----------------------------------------------

  /** The append-only canonical event history produced by this service. */
  async getEventHistory(): Promise<readonly StoredEvent[]> {
    return this.bus.eventLog.read();
  }

  /** The injected (or default) event bus, for wiring projections/subscribers. */
  get eventBus(): EventBus {
    return this.bus;
  }
}
