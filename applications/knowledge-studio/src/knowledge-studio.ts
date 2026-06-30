/**
 * Knowledge Studio (KMOS-0009 reference application).
 *
 * A thin experience layer: it composes the Search and Knowledge platform
 * services through their business APIs and presents read-oriented views
 * (search, concept detail, relationship navigation). It owns NO business logic
 * and no canonical objects -- applications are replaceable views over knowledge
 * (KMOS-9999 §9, KMOS-0009).
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { SearchService } from '@kmos/search';
import type { SearchFilters, SearchHit } from '@kmos/search';
import type { KnowledgeService } from '@kmos/knowledge';
import type { KnowledgeObject, RelationshipObject, VocabularyObject } from '@kmos/knowledge';

export interface KnowledgeStudioOptions {
  readonly search: SearchService;
  readonly knowledge: KnowledgeService;
}

export interface ConceptDetail {
  readonly knowledge: KnowledgeObject;
  readonly vocabulary: readonly VocabularyObject[];
  readonly history: readonly KnowledgeObject[];
}

export interface RelationshipNeighbour {
  readonly relationshipId: string;
  readonly relation: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly otherId: CanonicalId;
}

export class KnowledgeStudio {
  private readonly search: SearchService;
  private readonly knowledge: KnowledgeService;

  constructor(opts: KnowledgeStudioOptions) {
    this.search = opts.search;
    this.knowledge = opts.knowledge;
  }

  /** Discover knowledge by query (delegates to Search). */
  find(query: string, filters: SearchFilters = {}): readonly SearchHit[] {
    return this.search.search(query, filters);
  }

  /** Full read view of one concept: object + multilingual vocabulary + version history. */
  conceptDetail(id: CanonicalId): ConceptDetail | undefined {
    const knowledge = this.knowledge.getKnowledge(id);
    if (!knowledge) return undefined;
    return {
      knowledge,
      vocabulary: this.knowledge.getVocabulary(id),
      history: this.knowledge.getHistory(id),
    };
  }

  /** Navigate the knowledge graph from a node via its first-class relationships. */
  navigate(id: CanonicalId): readonly RelationshipNeighbour[] {
    const graph = this.knowledge.buildGraphProjection();
    const out: RelationshipNeighbour[] = [];
    for (const edge of graph.edges.values()) {
      const e = edge as { relationshipId: string; relation: string; sourceId: CanonicalId; targetId: CanonicalId };
      if (e.sourceId === id) out.push({ relationshipId: e.relationshipId, relation: e.relation, direction: 'outgoing', otherId: e.targetId });
      else if (e.targetId === id) out.push({ relationshipId: e.relationshipId, relation: e.relation, direction: 'incoming', otherId: e.sourceId });
    }
    return out;
  }

  getRelationship(id: CanonicalId): RelationshipObject | undefined {
    return this.knowledge.getRelationship(id);
  }
}
