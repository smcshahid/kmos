/**
 * Administration (KMOS-0009 application).
 *
 * A thin administrative experience layer: it composes the Identity, Governance
 * and Capability Registry platform services through their business APIs to let
 * an operator administer the institution -- provision identities, roles and
 * permissions; review and decide pending approvals; and discover and certify
 * capabilities.
 *
 * It owns NO business logic and creates NO canonical objects or events of its
 * own: every state change is delegated to the relevant platform service, which
 * remains the sole authority and the only producer of canonical facts
 * (KMOS-9999 §9, §19, KMOS-0009). Applications are replaceable views over the
 * platform.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type {
  IdentityService,
  IdentityObject,
  RoleObject,
  PermissionObject,
} from '@kmos/identity';
import type {
  GovernanceService,
  Approval,
  ReviewerVerdict,
} from '@kmos/governance';
import type {
  CapabilityRegistryService,
  CapabilityObject,
  CapabilityCertificationObject,
  CertificationLevel,
  DiscoverQuery,
} from '@kmos/capability-registry';

export interface AdministrationOptions {
  readonly identity: IdentityService;
  readonly governance: GovernanceService;
  readonly capabilities: CapabilityRegistryService;
}

/** Input for provisioning a human user (a Human identity) via the Identity Service. */
export interface CreateUserInput {
  readonly displayName: string;
  readonly organizationId?: CanonicalId;
}

export class Administration {
  private readonly identity: IdentityService;
  private readonly governance: GovernanceService;
  private readonly capabilities: CapabilityRegistryService;

  /**
   * Approval ids this administration view has requested through the Governance
   * Service. The Governance business API exposes no "list approvals" method, so
   * this thin view tracks the ids it has seen and re-reads their *live* state
   * from the service on demand. This is a read-side index only -- it holds no
   * approval state and produces no canonical facts.
   */
  private readonly trackedApprovalIds = new Set<CanonicalId>();

  constructor(opts: AdministrationOptions) {
    this.identity = opts.identity;
    this.governance = opts.governance;
    this.capabilities = opts.capabilities;
  }

  // --- Identity administration (delegates to the Identity Service) ----------

  /** Provision a human user. Delegates to Identity Service createIdentity (kind Human). */
  createUser(input: CreateUserInput): Promise<IdentityObject> {
    return this.identity.createIdentity({
      kind: 'Human',
      displayName: input.displayName,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    });
  }

  /** Assign an existing role to an identity. Delegates to Identity Service. */
  assignRole(identityId: CanonicalId, roleId: CanonicalId): Promise<IdentityObject> {
    return this.identity.assignRole(identityId, roleId);
  }

  /** Define a business role (optionally seeded with permissions). Delegates to Identity Service. */
  createRole(name: string, permissionIds: readonly CanonicalId[] = []): RoleObject {
    return this.identity.createRole(name, permissionIds);
  }

  /** Define a business permission. Delegates to Identity Service. */
  createPermission(name: string): PermissionObject {
    return this.identity.createPermission(name);
  }

  // --- Governance review (delegates to the Governance Service) --------------

  /**
   * Request an approval through the Governance Service and remember its id so it
   * can be surfaced by `pendingApprovals`. Delegates entirely to Governance.
   */
  async requestApproval(
    subjectId: CanonicalId,
    reviewers: readonly string[],
  ): Promise<Approval> {
    const approval = await this.governance.requestApproval({
      subjectId,
      reviewers,
      mode: 'Single',
    });
    this.trackedApprovalIds.add(approval.id);
    return approval;
  }

  /**
   * The approvals this view has requested that are still awaiting a decision.
   * State is read live from the Governance Service (the authority); this view
   * filters, it does not store approval state.
   */
  pendingApprovals(): readonly Approval[] {
    const pending: Approval[] = [];
    for (const id of this.trackedApprovalIds) {
      const approval = this.governance.getApproval(id);
      if (approval && approval.body.state === 'Pending') pending.push(approval);
    }
    return pending;
  }

  /**
   * Record a reviewer's decision on an approval. Delegates to the Governance
   * Service grant/reject business API; Governance owns the resulting facts.
   */
  decideApproval(
    approvalId: CanonicalId,
    reviewer: string,
    verdict: ReviewerVerdict,
    reason: string,
  ): Promise<Approval> {
    return verdict === 'Granted'
      ? this.governance.grantApproval(approvalId, reviewer, reason)
      : this.governance.rejectApproval(approvalId, reviewer, reason);
  }

  // --- Capability administration (delegates to the Capability Registry) -----

  /** Discover all registered capabilities. Delegates to the Capability Registry. */
  listCapabilities(query: DiscoverQuery = {}): readonly CapabilityObject[] {
    return this.capabilities.discover(query);
  }

  /** Certify a capability version at a level. Delegates to the Capability Registry. */
  certifyCapability(
    capabilityId: CanonicalId,
    version: string,
    level: CertificationLevel,
    authority: string,
  ): Promise<CapabilityCertificationObject> {
    return this.capabilities.certify(capabilityId, version, level, authority);
  }
}
