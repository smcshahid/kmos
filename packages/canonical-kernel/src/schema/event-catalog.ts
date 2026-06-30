/**
 * Canonical Event Catalog (KMOS-0110, KMOS-10040).
 *
 * The authoritative registry of canonical event TYPES and the single source of
 * truth for the platform's event vocabulary (remediation MED-5). Services and
 * the platform-catalog reference this seed rather than re-declaring event types.
 * Only events registered here may be published through the kernel bus.
 */

import type { OwningService } from '../canonical-object.js';
import type { EventClass } from '../event-envelope.js';

export interface EventTypeDefinition {
  readonly type: string;
  readonly owner: OwningService | 'Capability';
  readonly eventClass: EventClass;
  readonly schemaVersion: string;
  readonly category: string;
}

function def(
  type: string,
  owner: OwningService | 'Capability',
  eventClass: EventClass,
  category: string,
  schemaVersion = '1.0',
): EventTypeDefinition {
  return { type, owner, eventClass, schemaVersion, category };
}

const SEED: readonly EventTypeDefinition[] = [
  // Knowledge (KMOS-10040 §7)
  def('KnowledgeCreated', 'KnowledgeService', 'Institutional', 'Knowledge'),
  def('KnowledgeUpdated', 'KnowledgeService', 'Institutional', 'Knowledge'),
  def('KnowledgeApproved', 'KnowledgeService', 'Institutional', 'Knowledge'),
  def('KnowledgeArchived', 'KnowledgeService', 'Institutional', 'Knowledge'),
  def('ConceptCreated', 'KnowledgeService', 'Institutional', 'Knowledge'),
  def('VocabularyExpanded', 'KnowledgeService', 'Institutional', 'Knowledge'),
  def('RelationshipEstablished', 'KnowledgeService', 'Institutional', 'Knowledge'),
  def('OntologyExtended', 'KnowledgeService', 'Institutional', 'Knowledge'),

  // Asset (KMOS-10040 §8)
  def('AssetRegistered', 'AssetRegistry', 'Institutional', 'Asset'),
  def('AssetUpdated', 'AssetRegistry', 'Institutional', 'Asset'),
  def('AssetArchived', 'AssetRegistry', 'Institutional', 'Asset'),
  def('AssetVersionCreated', 'AssetRegistry', 'Institutional', 'Asset'),
  def('IntegrityVerified', 'AssetRegistry', 'Institutional', 'Asset'),
  def('IntegrityFailed', 'AssetRegistry', 'Operational', 'Asset'),
  def('EvidencePackageCreated', 'AssetRegistry', 'Institutional', 'Asset'),
  def('LineageUpdated', 'AssetRegistry', 'Institutional', 'Asset'),
  def('AssetRestored', 'AssetRegistry', 'Institutional', 'Asset'),
  def('StorageMigrated', 'AssetRegistry', 'Operational', 'Asset'),

  // Event Service (KMOS-10040 §9)
  def('ReplayStarted', 'EventService', 'Operational', 'EventService'),
  def('ReplayCompleted', 'EventService', 'Operational', 'EventService'),
  def('SchemaRegistered', 'EventService', 'Platform', 'EventService'),
  def('SubscriptionCreated', 'EventService', 'Platform', 'EventService'),
  def('DeadLetterCreated', 'EventService', 'Operational', 'EventService'),
  def('EventValidated', 'EventService', 'Operational', 'EventService'),

  // Workflow (KMOS-10040 §10)
  def('WorkflowRegistered', 'WorkflowService', 'Platform', 'Workflow'),
  def('WorkflowStarted', 'WorkflowService', 'Institutional', 'Workflow'),
  def('WorkflowCompleted', 'WorkflowService', 'Institutional', 'Workflow'),
  def('WorkflowCancelled', 'WorkflowService', 'Institutional', 'Workflow'),
  def('HumanTaskCreated', 'WorkflowService', 'Institutional', 'Workflow'),
  def('ApprovalTaskCompleted', 'WorkflowService', 'Institutional', 'Workflow'),
  def('CompensationStarted', 'WorkflowService', 'Institutional', 'Workflow'),
  def('WorkflowPaused', 'WorkflowService', 'Institutional', 'Workflow'),
  def('WorkflowResumed', 'WorkflowService', 'Institutional', 'Workflow'),
  def('WorkflowFailed', 'WorkflowService', 'Institutional', 'Workflow'),
  def('WorkflowRetried', 'WorkflowService', 'Institutional', 'Workflow'),
  def('WorkflowCompensated', 'WorkflowService', 'Institutional', 'Workflow'),
  def('StepCompleted', 'WorkflowService', 'Operational', 'Workflow'),
  def('StepFailed', 'WorkflowService', 'Operational', 'Workflow'),
  def('HumanTaskCompleted', 'WorkflowService', 'Institutional', 'Workflow'),
  def('ApprovalTaskCreated', 'WorkflowService', 'Institutional', 'Workflow'),
  def('TimerExpired', 'WorkflowService', 'Operational', 'Workflow'),
  def('CompensationCompleted', 'WorkflowService', 'Institutional', 'Workflow'),

  // Capability registry (KMOS-10040 §11)
  def('CapabilityRegistered', 'CapabilityRegistry', 'Platform', 'Capability'),
  def('CapabilityCertified', 'CapabilityRegistry', 'Platform', 'Capability'),
  def('CapabilityDeprecated', 'CapabilityRegistry', 'Platform', 'Capability'),
  def('ManifestValidated', 'CapabilityRegistry', 'Platform', 'Capability'),

  // Capability runtime (KMOS-0210 draft)
  def('CapabilityRuntimeRegistered', 'Capability', 'Platform', 'Capability'),
  def('CapabilityExecutionStarted', 'Capability', 'Operational', 'Capability'),
  def('CapabilityExecutionCompleted', 'Capability', 'Capability', 'Capability'),
  def('CapabilityExecutionFailed', 'Capability', 'Operational', 'Capability'),

  // Identity (KMOS-10040 §12)
  def('IdentityCreated', 'IdentityService', 'Institutional', 'Identity'),
  def('AuthenticationSucceeded', 'IdentityService', 'Operational', 'Identity'),
  def('AuthenticationFailed', 'IdentityService', 'Operational', 'Identity'),
  def('RoleAssigned', 'IdentityService', 'Institutional', 'Identity'),
  def('PermissionGranted', 'IdentityService', 'Institutional', 'Identity'),
  def('DelegationCreated', 'IdentityService', 'Institutional', 'Identity'),
  def('ServiceAccountRegistered', 'IdentityService', 'Institutional', 'Identity'),

  // Governance (KMOS-10040 §13)
  def('ApprovalRequested', 'GovernanceService', 'Institutional', 'Governance'),
  def('ApprovalGranted', 'GovernanceService', 'Institutional', 'Governance'),
  def('ApprovalRejected', 'GovernanceService', 'Institutional', 'Governance'),
  def('CertificationGranted', 'GovernanceService', 'Institutional', 'Governance'),
  def('ComplianceVerified', 'GovernanceService', 'Institutional', 'Governance'),
  def('RiskAssessed', 'GovernanceService', 'Institutional', 'Governance'),
  def('TrustAssessmentCompleted', 'GovernanceService', 'Institutional', 'Governance'),
  def('PolicyRegistered', 'GovernanceService', 'Institutional', 'Governance'),
  def('PolicyVersionRegistered', 'GovernanceService', 'Institutional', 'Governance'),
  def('PolicyEvaluated', 'GovernanceService', 'Institutional', 'Governance'),
  def('ReviewCreated', 'GovernanceService', 'Institutional', 'Governance'),
  def('ReviewCompleted', 'GovernanceService', 'Institutional', 'Governance'),
  def('CertificationRevoked', 'GovernanceService', 'Institutional', 'Governance'),
  def('ExceptionCreated', 'GovernanceService', 'Institutional', 'Governance'),
  def('ExceptionClosed', 'GovernanceService', 'Institutional', 'Governance'),

  // Configuration Service (KMOS-0209 draft)
  def('ConfigurationRegistered', 'ConfigurationService', 'Platform', 'Configuration'),
  def('ConfigurationUpdated', 'ConfigurationService', 'Platform', 'Configuration'),
  def('ConfigurationProfileChanged', 'ConfigurationService', 'Platform', 'Configuration'),
  def('SecretReferenced', 'ConfigurationService', 'Platform', 'Configuration'),

  // Search Service (KMOS-0208 draft)
  def('IndexCreated', 'SearchService', 'Platform', 'Search'),
  def('KnowledgeIndexed', 'SearchService', 'Operational', 'Search'),
  def('AssetIndexed', 'SearchService', 'Operational', 'Search'),
  def('IndexRebuilt', 'SearchService', 'Operational', 'Search'),

  // Capability execution (business work) (KMOS-10040 §14)
  def('TranscriptGenerated', 'Capability', 'Capability', 'Language'),
  def('TranscriptCorrected', 'Capability', 'Capability', 'Language'),
  def('TranslationCompleted', 'Capability', 'Capability', 'Language'),
  def('KnowledgeExtracted', 'Capability', 'Capability', 'Knowledge'),
  def('RenderCompleted', 'Capability', 'Capability', 'Media'),
  def('PublicationReleased', 'Capability', 'Institutional', 'Publishing'),
  def('ArchiveGenerated', 'Capability', 'Capability', 'Preservation'),

  // Domain events (M3)
  def('LectureImported', 'WorkflowService', 'Institutional', 'Media'),
  def('LectureProcessed', 'WorkflowService', 'Institutional', 'Media'),
  def('VocabularyLearned', 'KnowledgeService', 'Institutional', 'Language'),
  def('StoryboardCompleted', 'WorkflowService', 'Capability', 'Media'),
  def('PublicationPrepared', 'WorkflowService', 'Institutional', 'Publishing'),
  def('PublicationMetadataGenerated', 'WorkflowService', 'Institutional', 'Publishing'),
  def('PreservationCompleted', 'AssetRegistry', 'Institutional', 'Preservation'),
  def('AiContributionRecorded', 'GovernanceService', 'Institutional', 'AI'),
  def('ConnectorActivated', 'EventService', 'Platform', 'Platform'),
  def('ExternalRecordIngested', 'AssetRegistry', 'Institutional', 'Platform'),
];

/** Immutable registry of canonical event types, keyed by event type name. */
export class EventCatalog {
  private readonly byType = new Map<string, EventTypeDefinition>();

  constructor(seed: readonly EventTypeDefinition[] = SEED) {
    for (const d of seed) this.register(d);
  }

  /** Register a new canonical event type. Re-registration of the same type is rejected. */
  register(definition: EventTypeDefinition): void {
    if (this.byType.has(definition.type)) {
      throw new Error(`Event type already registered: ${definition.type}`);
    }
    this.byType.set(definition.type, definition);
  }

  has(type: string): boolean {
    return this.byType.has(type);
  }

  get(type: string): EventTypeDefinition | undefined {
    return this.byType.get(type);
  }

  list(): readonly EventTypeDefinition[] {
    return [...this.byType.values()];
  }
}

/** The default catalog seeded with the full canonical event vocabulary. */
export const defaultEventCatalog = new EventCatalog();
