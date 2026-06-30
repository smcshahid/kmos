/**
 * Governance event catalog (KMOS-0207, KMOS-10040 §13).
 *
 * The seeded canonical event families for Governance (ApprovalRequested,
 * ApprovalGranted, ApprovalRejected, CertificationGranted, ComplianceVerified,
 * RiskAssessed, TrustAssessmentCompleted) live in the kernel's default catalog
 * and may NOT be redefined (KMOS-9999 §7). The Governance Service additionally
 * emits a handful of fact types that the kernel does not yet seed (policy
 * registration, review completion, exception lifecycle, certification
 * revocation). Rather than mutate the kernel, we build a LOCAL catalog that
 * extends the default with these extra governance facts and hand it to a
 * dedicated EventBus. Naming follows BusinessObject + PastTenseVerb, exactly as
 * the kernel's catalog enforces.
 */

import { EventCatalog, type EventTypeDefinition } from '@kmos/canonical-kernel';

/** Extra governance fact types not yet seeded in the kernel catalog. */
export const GOVERNANCE_EXTRA_EVENT_TYPES: readonly EventTypeDefinition[] = [
  { type: 'PolicyRegistered', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Governance' },
  { type: 'PolicyVersionRegistered', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Governance' },
  { type: 'PolicyEvaluated', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Governance' },
  { type: 'ReviewCreated', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Governance' },
  { type: 'ReviewCompleted', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Governance' },
  { type: 'CertificationRevoked', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Governance' },
  { type: 'ExceptionCreated', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Governance' },
  { type: 'ExceptionClosed', owner: 'GovernanceService', eventClass: 'Institutional', schemaVersion: '1.0', category: 'Governance' },
];

/**
 * Build a catalog seeded with the kernel defaults PLUS the extra governance
 * fact types. The kernel's default seed is re-used by listing it from a fresh
 * default catalog so we never duplicate or diverge from the canonical seed.
 */
export function createGovernanceCatalog(): EventCatalog {
  // Kernel is the authoritative catalog (MED-5); these types now live in the
  // kernel seed. Registration is idempotent and adds nothing new — kept for
  // backward compatibility of the factory's API.
  const catalog = new EventCatalog(); // canonical kernel seed (now complete)
  for (const def of GOVERNANCE_EXTRA_EVENT_TYPES) if (!catalog.has(def.type)) catalog.register(def);
  return catalog;
}
