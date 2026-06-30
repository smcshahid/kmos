/**
 * @kmos/governance — Governance Service (KMOS-0207): the evidence-driven,
 * explainable governance engine. Owns Policy, Approval, Certification,
 * ComplianceRecord, TrustAssessment (+ PolicyVersion, Review, Decision,
 * RiskAssessment, Exception, GovernanceAudit) and exposes the governance
 * business APIs over canonical events.
 */
export * from './domain/model.js';
export * from './domain/ports.js';
export * from './domain/catalog.js';
export * from './infrastructure/in-memory-repositories.js';
export * from './application/governance-service.js';
