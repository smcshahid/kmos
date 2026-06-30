/**
 * @kmos/knowledge — Knowledge Service (KMOS-0201, KMOS-0130).
 *
 * The authoritative owner of the institution's knowledge model: KnowledgeObjects
 * (Topic/Definition/Teaching/Concept), Concepts, Vocabulary, first-class
 * versioned Relationships, and Collections. Knowledge is immutable and versioned;
 * the semantic graph is a regenerable projection, not the system of record.
 */
export * from './domain/types.js';
export * from './domain/ports.js';
export * from './domain/graph-projection.js';
export * from './infrastructure/in-memory-repository.js';
export * from './application/knowledge-service.js';
