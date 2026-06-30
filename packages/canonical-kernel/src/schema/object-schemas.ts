/**
 * Canonical object schemas (KMOS-0100 §5, KMOS-10030).
 *
 * The common canonical-object structure schema, plus a registry seeded with the
 * "proven" core objects (KMOS-10030 §19). Object bodies are validated by their
 * owning service; the kernel validates the common envelope so cross-service
 * consistency is guaranteed.
 */

import { LIFECYCLE_STATES } from '../lifecycle.js';
import { OWNING_SERVICES } from '../canonical-object.js';
import type { Schema } from './validate.js';

/** Schema for the common canonical-object structure (excluding the type-specific body). */
export const CANONICAL_OBJECT_SCHEMA: Schema = {
  type: 'object',
  required: [
    'id',
    'type',
    'schemaVersion',
    'owner',
    'version',
    'lifecycle',
    'createdAt',
    'updatedAt',
    'relationships',
    'governance',
    'body',
  ],
  properties: {
    id: { type: 'string', format: 'canonical-id' },
    type: { type: 'string', pattern: '^[A-Z][A-Za-z0-9]+$' },
    schemaVersion: { type: 'string', pattern: '^[0-9]+\\.[0-9]+$' },
    owner: { type: 'string', enum: [...OWNING_SERVICES] },
    version: { type: 'integer', minimum: 1 },
    lifecycle: { type: 'string', enum: [...LIFECYCLE_STATES] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    displayName: { type: 'string' },
    organizationId: { type: 'string', format: 'canonical-id' },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        required: ['relation', 'targetId', 'targetType'],
        properties: {
          relation: { type: 'string', minLength: 1 },
          targetId: { type: 'string', format: 'canonical-id' },
          targetType: { type: 'string', minLength: 1 },
        },
      },
    },
    governance: { type: 'object' },
    body: { type: 'object' },
  },
};

/** Proven core canonical object types (KMOS-10030 §6–§12, §19). */
export const CORE_OBJECT_TYPES: Readonly<Record<string, string>> = {
  // Knowledge Service
  KnowledgeObject: 'KnowledgeService',
  Concept: 'KnowledgeService',
  Vocabulary: 'KnowledgeService',
  Relationship: 'KnowledgeService',
  Collection: 'KnowledgeService',
  // Asset Registry
  Asset: 'AssetRegistry',
  AssetVersion: 'AssetRegistry',
  Provenance: 'AssetRegistry',
  Lineage: 'AssetRegistry',
  EvidencePackage: 'AssetRegistry',
  // Event Service
  CanonicalEvent: 'EventService',
  EventSchema: 'EventService',
  Subscription: 'EventService',
  ReplaySession: 'EventService',
  // Workflow
  WorkflowDefinition: 'WorkflowService',
  WorkflowExecution: 'WorkflowService',
  HumanTask: 'WorkflowService',
  ApprovalTask: 'WorkflowService',
  // Capability Registry
  Capability: 'CapabilityRegistry',
  CapabilityManifest: 'CapabilityRegistry',
  CapabilityContract: 'CapabilityRegistry',
  CapabilityCertification: 'CapabilityRegistry',
  // Identity
  Identity: 'IdentityService',
  Organization: 'IdentityService',
  Role: 'IdentityService',
  Permission: 'IdentityService',
  Delegation: 'IdentityService',
  // Governance
  Policy: 'GovernanceService',
  Approval: 'GovernanceService',
  Certification: 'GovernanceService',
  ComplianceRecord: 'GovernanceService',
  TrustAssessment: 'GovernanceService',
};
