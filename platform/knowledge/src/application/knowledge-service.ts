/**
 * Knowledge Service application layer (KMOS-0201, KMOS-0130).
 *
 * The authoritative owner of the institution's knowledge model. It orchestrates
 * the domain (canonical objects + invariants) over repository ports, publishes a
 * canonical event for every meaningful change, and exposes the business APIs of
 * KMOS-0201. It is transport- and broker-independent and imports no other
 * platform service (cross-service contact is canonical events + APIs only).
 *
 * Guarantees implemented here:
 *  - Immutable versioning: updateKnowledge appends version+1, never overwrites;
 *    getHistory returns the full lineage (KMOS-0201).
 *  - Relationships are first-class versioned objects; broken relationships are
 *    rejected (no orphaned/dangling edges) (KMOS-0201 §12).
 *  - Semantic integrity: duplicate concepts are rejected with a Conflict error
 *    (KMOS-0201 §13); orphaned knowledge is prevented by validating references.
 *  - Multilingual: one language-independent KnowledgeObject; Vocabulary objects
 *    carry language; translations never duplicate the KO (KMOS-0130 §14).
 *  - Approval workflow over the canonical lifecycle using `canTransition`; the
 *    actual approval decision may be driven externally by governance, so no
 *    governance policy is hardcoded here.
 *  - The semantic graph is a regenerable projection, not the system of record
 *    (KMOS-0201 §12).
 */

import {
  EventBus,
  EventCatalog,
  KmosError,
  canTransition,
  createCanonicalObject,
  createEvent,
  newCanonicalId,
  replay,
  type CanonicalId,
  type CanonicalReference,
  type GovernanceMetadata,
  type LifecycleState,
  type StoredEvent,
} from '@kmos/canonical-kernel';
import {
  type CollectionObject,
  type GraphEdge,
  type GraphNode,
  type KnowledgeBody,
  type KnowledgeCategory,
  type KnowledgeGraph,
  type KnowledgeObject,
  type Provenance,
  type RelationshipBody,
  type RelationshipObject,
  type RelationType,
  type VocabularyBody,
  type VocabularyObject,
} from '../domain/types.js';
import type { VersionedRepository } from '../domain/ports.js';
import { InMemoryVersionedRepository } from '../infrastructure/in-memory-repository.js';
import {
  buildGraph,
  edgeOf,
  graphFromState,
  graphProjection,
  nodeOf,
} from '../domain/graph-projection.js';

const OWNER = 'KnowledgeService' as const;

export interface KnowledgeServiceOptions {
  /** Injected event bus (default a fresh in-process bus). */
  readonly bus?: EventBus;
  /** Deterministic clock for object/event timestamps (tests/replay). */
  readonly now?: () => string;
}

export interface CreateKnowledgeInput {
  readonly category: KnowledgeCategory;
  readonly canonicalName: string;
  readonly definition: string;
  readonly primaryLanguage: string;
  readonly organizationId?: CanonicalId;
  readonly evidenceRefs?: readonly CanonicalId[];
  readonly confidence?: number;
}

export interface CreateRelationshipInput {
  readonly relation: RelationType;
  readonly sourceId: CanonicalId;
  readonly targetId: CanonicalId;
  readonly evidenceRefs?: readonly CanonicalId[];
  readonly confidence?: number;
}

export interface AddVocabularyInput {
  readonly language: string;
  readonly preferredTerm: string;
  readonly aliases?: readonly string[];
  readonly transliteration?: string;
}

/** Approval lifecycle path used by the Knowledge Service (KMOS-0201). */
const APPROVAL_PATH: readonly LifecycleState[] = [
  'Created',
  'Reviewed',
  'Validated',
  'Approved',
  'Published',
];

export class KnowledgeService {
  private readonly bus: EventBus;
  private readonly now: () => string;
  private readonly knowledge: VersionedRepository<KnowledgeObject> =
    new InMemoryVersionedRepository<KnowledgeObject>();
  private readonly relationships: VersionedRepository<RelationshipObject> =
    new InMemoryVersionedRepository<RelationshipObject>();
  private readonly vocabulary: VersionedRepository<VocabularyObject> =
    new InMemoryVersionedRepository<VocabularyObject>();
  private readonly collections: VersionedRepository<CollectionObject> =
    new InMemoryVersionedRepository<CollectionObject>();

  constructor(options: KnowledgeServiceOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
    // Use the seeded catalog by default; all event types we publish are seeded
    // (KnowledgeCreated/Updated/Approved/Archived, ConceptCreated,
    // VocabularyExpanded, RelationshipEstablished, OntologyExtended). A local
    // catalog could be installed for additional types; none are needed here.
    this.bus = options.bus ?? new EventBus();
  }

  /** The underlying event bus (for in-monolith wiring / inspection). */
  get eventBus(): EventBus {
    return this.bus;
  }

  // --- Provenance helper -------------------------------------------------

  private provenanceOf(
    evidenceRefs: readonly CanonicalId[] | undefined,
    confidence: number | undefined,
  ): Provenance {
    const refs = evidenceRefs ?? [];
    return {
      evidenceRefs: refs,
      confidence: confidence ?? (refs.length > 0 ? 1 : 0),
      // Knowledge without evidence is flagged unverified (KMOS-0201).
      unverified: refs.length === 0,
    };
  }

  private governanceOf(p: Provenance): GovernanceMetadata {
    return { evidenceRefs: p.evidenceRefs, confidence: p.confidence };
  }

  // --- Knowledge creation (KMOS-0201) -----------------------------------

  /**
   * Create a KnowledgeObject. Concepts (category 'Concept') are subject to the
   * duplicate-concept invariant (KMOS-0201 §13): a Concept whose canonicalName
   * already exists within the same organization AND primary language is rejected
   * with a Conflict error. We choose REJECT (documented) over silent reuse so
   * callers must consciously resolve a clash; getConcept lets them find the
   * existing one.
   */
  createKnowledge(input: CreateKnowledgeInput): KnowledgeObject {
    if (input.category === 'Concept') {
      const existing = this.findConcept(
        input.canonicalName,
        input.primaryLanguage,
        input.organizationId,
      );
      if (existing) {
        throw new KmosError(
          `Duplicate concept "${input.canonicalName}" (${input.primaryLanguage})`,
          {
            category: 'Conflict',
            code: 'knowledge.concept.duplicate',
            subject: existing.id,
            detail: {
              canonicalName: input.canonicalName,
              language: input.primaryLanguage,
              existingId: existing.id,
            },
          },
        );
      }
    }

    const provenance = this.provenanceOf(input.evidenceRefs, input.confidence);
    const body: KnowledgeBody = {
      category: input.category,
      canonicalName: input.canonicalName,
      definition: input.definition,
      primaryLanguage: input.primaryLanguage,
      provenance,
    };
    const objectType = input.category === 'Concept' ? 'Concept' : 'KnowledgeObject';
    const ko = createCanonicalObject<KnowledgeBody>({
      id: newCanonicalId(objectType),
      type: objectType,
      schemaVersion: '1.0',
      owner: OWNER,
      lifecycle: 'Created',
      displayName: input.canonicalName,
      ...(input.organizationId !== undefined ? { organizationId: input.organizationId } : {}),
      governance: this.governanceOf(provenance),
      body,
      now: this.now(),
    });
    this.knowledge.add(ko);

    const eventType = input.category === 'Concept' ? 'ConceptCreated' : 'KnowledgeCreated';
    void this.publish(eventType, ko.id, {
      knowledgeId: ko.id,
      category: ko.body.category,
      canonicalName: ko.body.canonicalName,
      node: nodeOf(ko),
    }, ko.organizationId);
    return ko;
  }

  // --- Immutable versioning (KMOS-0201) ---------------------------------

  /**
   * Append a NEW version of a KnowledgeObject. The prior version is preserved
   * (corrections never overwrite). Returns the new head. Publishes
   * KnowledgeUpdated.
   */
  updateKnowledge(
    id: CanonicalId,
    changes: Partial<Pick<KnowledgeBody, 'canonicalName' | 'definition' | 'primaryLanguage'>> & {
      readonly evidenceRefs?: readonly CanonicalId[];
      readonly confidence?: number;
    },
    reason: string,
  ): KnowledgeObject {
    const head = this.requireKnowledge(id);
    const provenance =
      changes.evidenceRefs !== undefined || changes.confidence !== undefined
        ? this.provenanceOf(
            changes.evidenceRefs ?? head.body.provenance.evidenceRefs,
            changes.confidence ?? head.body.provenance.confidence,
          )
        : head.body.provenance;
    const nextBody: KnowledgeBody = {
      category: head.body.category,
      canonicalName: changes.canonicalName ?? head.body.canonicalName,
      definition: changes.definition ?? head.body.definition,
      primaryLanguage: changes.primaryLanguage ?? head.body.primaryLanguage,
      provenance,
    };
    const next: KnowledgeObject = {
      ...head,
      version: head.version + 1,
      lifecycle: head.lifecycle === 'Created' ? 'Updated' : head.lifecycle,
      updatedAt: this.now(),
      displayName: nextBody.canonicalName,
      governance: this.governanceOf(provenance),
      body: nextBody,
    };
    this.knowledge.appendVersion(next);
    void this.publish('KnowledgeUpdated', id, {
      knowledgeId: id,
      version: next.version,
      reason,
      node: nodeOf(next),
    }, next.organizationId);
    return next;
  }

  /** Full immutable lineage of a KnowledgeObject, oldest version first. */
  getHistory(id: CanonicalId): readonly KnowledgeObject[] {
    const history = this.knowledge.history(id);
    if (history.length === 0) throw this.notFound(id, 'knowledge');
    return history;
  }

  getKnowledge(id: CanonicalId): KnowledgeObject | undefined {
    return this.knowledge.head(id);
  }

  // --- Relationships as first-class versioned objects (KMOS-0201 §12) ----

  /**
   * Create a Relationship as its own versioned canonical object. Both endpoints
   * must already exist as canonical objects owned here (KnowledgeObject,
   * Concept, Vocabulary, Collection or another Relationship); otherwise the
   * relationship is rejected to prevent broken/orphaned edges.
   */
  createRelationship(input: CreateRelationshipInput): RelationshipObject {
    if (!this.existsAnywhere(input.sourceId)) {
      throw new KmosError(`Relationship source does not exist: ${input.sourceId}`, {
        category: 'NotFound',
        code: 'knowledge.relationship.broken_source',
        subject: input.sourceId,
      });
    }
    if (!this.existsAnywhere(input.targetId)) {
      throw new KmosError(`Relationship target does not exist: ${input.targetId}`, {
        category: 'NotFound',
        code: 'knowledge.relationship.broken_target',
        subject: input.targetId,
      });
    }
    const provenance = this.provenanceOf(input.evidenceRefs, input.confidence);
    const body: RelationshipBody = {
      relation: input.relation,
      sourceId: input.sourceId,
      targetId: input.targetId,
      provenance,
    };
    const relationships: readonly CanonicalReference[] = [
      { relation: 'source', targetId: input.sourceId, targetType: this.typeOf(input.sourceId) },
      { relation: 'target', targetId: input.targetId, targetType: this.typeOf(input.targetId) },
    ];
    const rel = createCanonicalObject<RelationshipBody>({
      id: newCanonicalId('Relationship'),
      type: 'Relationship',
      schemaVersion: '1.0',
      owner: OWNER,
      lifecycle: 'Created',
      displayName: `${input.relation}`,
      relationships,
      governance: this.governanceOf(provenance),
      body,
      now: this.now(),
    });
    this.relationships.add(rel);
    void this.publish('RelationshipEstablished', rel.id, {
      relationshipId: rel.id,
      relation: input.relation,
      sourceId: input.sourceId,
      targetId: input.targetId,
      edge: edgeOf(rel),
    });
    return rel;
  }

  /** Append a new version of a Relationship (immutable history, like knowledge). */
  updateRelationship(
    id: CanonicalId,
    changes: { readonly confidence?: number; readonly evidenceRefs?: readonly CanonicalId[] },
    reason: string,
  ): RelationshipObject {
    const head = this.relationships.head(id);
    if (!head) throw this.notFound(id, 'relationship');
    const provenance = this.provenanceOf(
      changes.evidenceRefs ?? head.body.provenance.evidenceRefs,
      changes.confidence ?? head.body.provenance.confidence,
    );
    const next: RelationshipObject = {
      ...head,
      version: head.version + 1,
      updatedAt: this.now(),
      governance: this.governanceOf(provenance),
      body: { ...head.body, provenance },
    };
    this.relationships.appendVersion(next);
    void this.publish('RelationshipEstablished', id, {
      relationshipId: id,
      version: next.version,
      reason,
      edge: edgeOf(next),
    });
    return next;
  }

  getRelationship(id: CanonicalId): RelationshipObject | undefined {
    return this.relationships.head(id);
  }

  getRelationshipHistory(id: CanonicalId): readonly RelationshipObject[] {
    const history = this.relationships.history(id);
    if (history.length === 0) throw this.notFound(id, 'relationship');
    return history;
  }

  // --- Multilingual vocabulary (KMOS-0130 §14) --------------------------

  /**
   * Attach a language-specific Vocabulary object to a language-independent
   * KnowledgeObject. The KnowledgeObject is NOT duplicated — multiple languages
   * reference the same KO. Publishes VocabularyExpanded.
   */
  addVocabulary(knowledgeId: CanonicalId, input: AddVocabularyInput): VocabularyObject {
    this.requireKnowledge(knowledgeId);
    const body: VocabularyBody = {
      knowledgeId,
      language: input.language,
      preferredTerm: input.preferredTerm,
      aliases: input.aliases ?? [],
      ...(input.transliteration !== undefined ? { transliteration: input.transliteration } : {}),
    };
    const vocab = createCanonicalObject<VocabularyBody>({
      id: newCanonicalId('Vocabulary'),
      type: 'Vocabulary',
      schemaVersion: '1.0',
      owner: OWNER,
      lifecycle: 'Active',
      displayName: `${input.preferredTerm} (${input.language})`,
      relationships: [
        { relation: 'TranslatedAs', targetId: knowledgeId, targetType: this.typeOf(knowledgeId) },
      ],
      body,
      now: this.now(),
    });
    this.vocabulary.add(vocab);
    void this.publish('VocabularyExpanded', vocab.id, {
      vocabularyId: vocab.id,
      knowledgeId,
      language: input.language,
      preferredTerm: input.preferredTerm,
    });
    return vocab;
  }

  /** Vocabulary heads referencing a given KnowledgeObject. */
  getVocabulary(knowledgeId: CanonicalId): readonly VocabularyObject[] {
    return this.vocabulary.heads().filter((v) => v.body.knowledgeId === knowledgeId);
  }

  // --- Collections / ontology (KMOS-0201) -------------------------------

  /**
   * Create a Collection grouping existing knowledge objects. Members must exist
   * (no orphaned membership). Publishes OntologyExtended.
   */
  createCollection(name: string, memberIds: readonly CanonicalId[]): CollectionObject {
    for (const m of memberIds) {
      if (!this.existsAnywhere(m)) {
        throw new KmosError(`Collection member does not exist: ${m}`, {
          category: 'NotFound',
          code: 'knowledge.collection.broken_member',
          subject: m,
        });
      }
    }
    const collection = createCanonicalObject<{ name: string; memberIds: readonly CanonicalId[] }>({
      id: newCanonicalId('Collection'),
      type: 'Collection',
      schemaVersion: '1.0',
      owner: OWNER,
      lifecycle: 'Active',
      displayName: name,
      relationships: memberIds.map((id) => ({
        relation: 'Contains',
        targetId: id,
        targetType: this.typeOf(id),
      })),
      body: { name, memberIds },
      now: this.now(),
    });
    this.collections.add(collection);
    void this.publish('OntologyExtended', collection.id, {
      collectionId: collection.id,
      name,
      memberCount: memberIds.length,
    });
    return collection;
  }

  // --- Approval workflow (KMOS-0201) ------------------------------------

  /**
   * Advance a KnowledgeObject one step along the approval path
   * (Created -> Reviewed -> Validated -> Approved -> Published) using the kernel
   * `canTransition` guard. Appends a new version (immutable lifecycle history).
   * Publishes KnowledgeApproved when reaching Approved; the actual approval
   * decision is expected to be governed externally (no policy here).
   */
  advanceLifecycle(id: CanonicalId, to: LifecycleState): KnowledgeObject {
    const head = this.requireKnowledge(id);
    if (!canTransition(head.lifecycle, to)) {
      throw new KmosError(
        `Illegal lifecycle transition ${head.lifecycle} -> ${to}`,
        {
          category: 'BusinessRule',
          code: 'knowledge.lifecycle.illegal_transition',
          subject: id,
          detail: { from: head.lifecycle, to },
        },
      );
    }
    const next: KnowledgeObject = {
      ...head,
      version: head.version + 1,
      lifecycle: to,
      updatedAt: this.now(),
    };
    this.knowledge.appendVersion(next);
    if (to === 'Approved') {
      void this.publish('KnowledgeApproved', id, { knowledgeId: id, version: next.version }, next.organizationId);
    } else if (to === 'Archived') {
      void this.publish('KnowledgeArchived', id, { knowledgeId: id, version: next.version }, next.organizationId);
    } else {
      void this.publish('KnowledgeUpdated', id, {
        knowledgeId: id,
        version: next.version,
        lifecycle: to,
        node: nodeOf(next),
      }, next.organizationId);
    }
    return next;
  }

  /**
   * Convenience: drive a KnowledgeObject to Approved through the approval path,
   * skipping steps the canonical lifecycle permits. Publishes KnowledgeApproved.
   */
  approve(id: CanonicalId): KnowledgeObject {
    let current = this.requireKnowledge(id);
    if (current.lifecycle === 'Approved' || current.lifecycle === 'Published') return current;
    const startIndex = Math.max(0, APPROVAL_PATH.indexOf(current.lifecycle));
    const approvedIndex = APPROVAL_PATH.indexOf('Approved');
    for (let i = startIndex + 1; i <= approvedIndex; i += 1) {
      const to = APPROVAL_PATH[i]!;
      if (!canTransition(current.lifecycle, to)) continue;
      current = this.advanceLifecycle(id, to);
    }
    if (current.lifecycle !== 'Approved') {
      // Fallback: direct transition if the path-stepping could not land on it.
      current = this.advanceLifecycle(id, 'Approved');
    }
    return current;
  }

  /** Archive a KnowledgeObject (publishes KnowledgeArchived). */
  archive(id: CanonicalId): KnowledgeObject {
    return this.advanceLifecycle(id, 'Archived');
  }

  // --- Graph projection (KMOS-0201 §12) ---------------------------------

  /**
   * Build the semantic graph from the AUTHORITATIVE object store. Nodes are
   * derived from KnowledgeObject/Concept heads; edges from Relationship heads.
   * The graph is regenerable and never the system of record.
   */
  buildGraphProjection(): KnowledgeGraph {
    return buildGraph(this.knowledge.heads(), this.relationships.heads());
  }

  /**
   * Regenerate the same graph purely by folding the immutable event log via the
   * kernel replay engine — proving the projection is derivable from the
   * authoritative event history (KMOS-0201 §12; Constitution §6).
   */
  buildGraphFromEvents(): KnowledgeGraph {
    const { state } = replay(this.bus.eventLog, graphProjection, { now: this.now });
    return graphFromState(state);
  }

  // --- Internal helpers --------------------------------------------------

  private findConcept(
    canonicalName: string,
    language: string,
    organizationId: CanonicalId | undefined,
  ): KnowledgeObject | undefined {
    return this.knowledge.heads().find(
      (k) =>
        k.body.category === 'Concept' &&
        k.body.canonicalName === canonicalName &&
        k.body.primaryLanguage === language &&
        k.organizationId === organizationId,
    );
  }

  /** Find an existing Concept by name/language (for callers who chose reuse). */
  getConcept(
    canonicalName: string,
    language: string,
    organizationId?: CanonicalId,
  ): KnowledgeObject | undefined {
    return this.findConcept(canonicalName, language, organizationId);
  }

  private existsAnywhere(id: CanonicalId): boolean {
    return (
      this.knowledge.has(id) ||
      this.relationships.has(id) ||
      this.vocabulary.has(id) ||
      this.collections.has(id)
    );
  }

  private typeOf(id: CanonicalId): string {
    return (
      this.knowledge.head(id)?.type ??
      this.relationships.head(id)?.type ??
      this.vocabulary.head(id)?.type ??
      this.collections.head(id)?.type ??
      'Unknown'
    );
  }

  private requireKnowledge(id: CanonicalId): KnowledgeObject {
    const head = this.knowledge.head(id);
    if (!head) throw this.notFound(id, 'knowledge');
    return head;
  }

  private notFound(id: CanonicalId, kind: string): KmosError {
    return new KmosError(`No such ${kind} object: ${id}`, {
      category: 'NotFound',
      code: `knowledge.${kind}.not_found`,
      subject: id,
    });
  }

  private publish(
    type: string,
    subjectId: CanonicalId,
    payload: Record<string, unknown>,
    organizationId?: CanonicalId,
  ): Promise<StoredEvent> {
    const ev = createEvent({
      type,
      schemaVersion: '1.0',
      producer: OWNER,
      subjectId,
      payload,
      time: this.now(),
      ...(organizationId !== undefined ? { organizationId } : {}),
    });
    return this.bus.publish(ev, { streamId: subjectId });
  }
}

export type { GraphNode, GraphEdge };
