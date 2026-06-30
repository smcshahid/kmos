/**
 * Knowledge domain types (KMOS-0201, KMOS-0130).
 *
 * The Knowledge Service is the authoritative owner of the institution's
 * knowledge model: KnowledgeObjects (and their Topic/Definition/Teaching
 * categories), Concepts, Vocabulary, Relationships and Collections. These are
 * canonical objects (owner `KnowledgeService`); their type-specific business
 * data lives in the bodies declared here. The kernel never interprets a body —
 * only this service does (KMOS-0100 §5).
 *
 * Design pillars realized by these types:
 *  - Relationships are first-class, versioned knowledge objects, not edges
 *    inferred from storage (KMOS-0201 §12).
 *  - A KnowledgeObject is language-independent; language lives in Vocabulary
 *    objects that reference it, so a translation never duplicates a KO
 *    (KMOS-0130 §14).
 *  - Provenance + confidence travel on every object; evidence-free knowledge is
 *    flagged unverified (KMOS-0201 provenance requirement).
 */

import type { CanonicalId, CanonicalObject } from '@kmos/canonical-kernel';

/**
 * KnowledgeObject categories. Topic/Definition/Teaching are editorial
 * categories of a KnowledgeObject; Concept/Vocabulary/Relationship/Collection
 * are distinct canonical object types with their own bodies below.
 */
export const KNOWLEDGE_CATEGORIES = ['Topic', 'Definition', 'Teaching', 'Concept'] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/**
 * Canonical relation vocabulary for first-class Relationship objects
 * (KMOS-0201 §12). Open-ended in spirit, but the seeded relations below are the
 * proven set; callers may pass any of these strings.
 */
export const RELATION_TYPES = [
  'Defines',
  'References',
  'Supports',
  'Contradicts',
  'Explains',
  'DerivedFrom',
  'RelatedTo',
  'Contains',
  'TranslatedAs',
] as const;
export type RelationType = (typeof RELATION_TYPES)[number] | string;

/** Provenance carried in a body (mirrors governance.evidenceRefs/confidence). */
export interface Provenance {
  /** Evidence/source canonical ids backing this knowledge. */
  readonly evidenceRefs: readonly CanonicalId[];
  /** 0..1 confidence in this knowledge. */
  readonly confidence: number;
  /** True when there is no supporting evidence (KMOS-0201: flag unverified). */
  readonly unverified: boolean;
}

/** Body of a KnowledgeObject (Topic/Definition/Teaching/Concept). */
export interface KnowledgeBody {
  readonly category: KnowledgeCategory;
  /** Language-independent canonical name (KMOS-0130 §14). */
  readonly canonicalName: string;
  /** Language-independent definition/description. */
  readonly definition: string;
  /** Primary language of authoring (the KO itself is language-independent). */
  readonly primaryLanguage: string;
  readonly provenance: Provenance;
}

export type KnowledgeObject = CanonicalObject<KnowledgeBody>;

/** Body of a first-class, versioned Relationship object (KMOS-0201 §12). */
export interface RelationshipBody {
  readonly relation: RelationType;
  readonly sourceId: CanonicalId;
  readonly targetId: CanonicalId;
  readonly provenance: Provenance;
}

export type RelationshipObject = CanonicalObject<RelationshipBody>;

/** Body of a language-specific Vocabulary object referencing a KnowledgeObject. */
export interface VocabularyBody {
  /** The language-independent KnowledgeObject this vocabulary expresses. */
  readonly knowledgeId: CanonicalId;
  readonly language: string;
  readonly preferredTerm: string;
  readonly aliases: readonly string[];
  readonly transliteration?: string;
}

export type VocabularyObject = CanonicalObject<VocabularyBody>;

/** Body of a Collection grouping knowledge objects (KMOS-0201). */
export interface CollectionBody {
  readonly name: string;
  readonly memberIds: readonly CanonicalId[];
}

export type CollectionObject = CanonicalObject<CollectionBody>;

/** A node in the derived semantic graph projection (KMOS-0201 §12). */
export interface GraphNode {
  readonly id: CanonicalId;
  readonly type: string;
  readonly category: KnowledgeCategory;
  readonly canonicalName: string;
  readonly version: number;
  readonly lifecycle: string;
  readonly confidence: number;
  readonly unverified: boolean;
}

/** An edge in the derived semantic graph projection, sourced from a Relationship. */
export interface GraphEdge {
  /** The canonical id of the Relationship object that authored this edge. */
  readonly relationshipId: CanonicalId;
  readonly relation: RelationType;
  readonly sourceId: CanonicalId;
  readonly targetId: CanonicalId;
  readonly confidence: number;
}

/** The semantic graph projection: nodes + edges derived from authoritative objects. */
export interface KnowledgeGraph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}
