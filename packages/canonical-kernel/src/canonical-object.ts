/**
 * Canonical object common structure (KMOS-0100 §5, KMOS-10030 §14).
 *
 * Every persistent business object in KMOS exposes this common structure. Each
 * object has exactly one authoritative owning service; other services reference
 * canonical identifiers only and never duplicate ownership.
 */

import type { CanonicalId } from './identifiers.js';
import type { LifecycleState } from './lifecycle.js';

/** The seven foundational services that own canonical objects (KMOS-10030). */
export const OWNING_SERVICES = [
  'KnowledgeService',
  'AssetRegistry',
  'EventService',
  'WorkflowService',
  'CapabilityRegistry',
  'IdentityService',
  'GovernanceService',
  'ConfigurationService',
  'SearchService',
] as const;

export type OwningService = (typeof OWNING_SERVICES)[number];

/** Security classification (KMOS-0006 §15, KMOS-0190). */
export const SECURITY_CLASSIFICATIONS = [
  'Public',
  'Internal',
  'Editorial',
  'Confidential',
  'Restricted',
  'Sensitive',
] as const;

export type SecurityClassification = (typeof SECURITY_CLASSIFICATIONS)[number];

/**
 * A typed reference to another canonical object. Relationships are explicit and
 * by-identifier; they are never inferred from storage structure (KMOS-0100 §3).
 */
export interface CanonicalReference {
  readonly relation: string; // e.g. "supportedBy", "producedBy", "references"
  readonly targetId: CanonicalId;
  readonly targetType: string;
}

/** Governance metadata attached to every canonical object (KMOS-0100 §5). */
export interface GovernanceMetadata {
  readonly approvalState?: string;
  readonly securityClassification?: SecurityClassification;
  readonly retentionPolicy?: string;
  readonly evidenceRefs?: readonly CanonicalId[];
  readonly reviewRefs?: readonly CanonicalId[];
  readonly confidence?: number; // 0..1 where applicable
}

/**
 * The canonical object envelope. `T` is the object-type-specific business body.
 * The kernel does not interpret `body`; the owning service does.
 */
export interface CanonicalObject<T extends object = Record<string, unknown>> {
  /** Permanent canonical identifier (KMOS-10030 §7). */
  readonly id: CanonicalId;
  /** Canonical object type, e.g. "Asset", "KnowledgeObject". */
  readonly type: string;
  /** Schema version of the object type (KMOS-10030 §14/§15). */
  readonly schemaVersion: string;
  /** Authoritative owning service. */
  readonly owner: OwningService;
  /** Monotonic object version; immutable history is kept by the owning service. */
  readonly version: number;
  /** Canonical lifecycle state. */
  readonly lifecycle: LifecycleState;
  /** ISO-8601 timestamps. */
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Optional human-facing label. */
  readonly displayName?: string;
  /** Owning organization / tenant (KMOS-0009 multi-tenancy). */
  readonly organizationId?: CanonicalId;
  /** Explicit, by-identifier relationships. */
  readonly relationships: readonly CanonicalReference[];
  /** Governance metadata. */
  readonly governance: GovernanceMetadata;
  /** Object-type-specific business body (owned/interpreted by the owning service). */
  readonly body: T;
}

export interface NewCanonicalObjectInput<T extends object> {
  readonly id: CanonicalId;
  readonly type: string;
  readonly schemaVersion: string;
  readonly owner: OwningService;
  readonly lifecycle?: LifecycleState;
  readonly displayName?: string;
  readonly organizationId?: CanonicalId;
  readonly relationships?: readonly CanonicalReference[];
  readonly governance?: GovernanceMetadata;
  readonly body: T;
  /** Override timestamps (used by replay/tests for determinism). */
  readonly now?: string;
}

/** Construct a version-1 canonical object with the common structure populated. */
export function createCanonicalObject<T extends object>(
  input: NewCanonicalObjectInput<T>,
): CanonicalObject<T> {
  const now = input.now ?? new Date().toISOString();
  return {
    id: input.id,
    type: input.type,
    schemaVersion: input.schemaVersion,
    owner: input.owner,
    version: 1,
    lifecycle: input.lifecycle ?? 'Created',
    createdAt: now,
    updatedAt: now,
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
    relationships: input.relationships ?? [],
    governance: input.governance ?? {},
    body: input.body,
  };
}
