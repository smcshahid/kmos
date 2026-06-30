/**
 * Research Portal (KMOS-0009 application).
 *
 * A thin experience layer over the platform: it composes the Search, Knowledge
 * and Asset Registry services through their business APIs to support discovery
 * (semantic search), evidence-backed question answering, citation lookup and
 * concept navigation. It presents read-oriented views only.
 *
 * It owns NO business logic, NO canonical objects and publishes NO events:
 * applications are replaceable views over the institution's knowledge
 * (KMOS-9999 §9, KMOS-0009). Every method here is pure assembly/composition of
 * results already produced by the platform services -- there is no inference,
 * ranking or persistence performed by the portal itself.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';
import type { SearchService, SearchFilters, SearchHit } from '@kmos/search';
import type { KnowledgeService, KnowledgeObject } from '@kmos/knowledge';
import type { AssetRegistryService, AssetObject } from '@kmos/assets';

export interface ResearchPortalOptions {
  readonly search: SearchService;
  readonly knowledge: KnowledgeService;
  readonly assets: AssetRegistryService;
}

/** A concept summary projected for an answer (read view only). */
export interface AnswerConcept {
  readonly id: CanonicalId;
  readonly canonicalName: string;
  readonly definition: string;
}

/** A deterministic, evidence-backed answer assembled from platform services. */
export interface Answer {
  readonly query: string;
  readonly concepts: readonly AnswerConcept[];
  /** Evidence Assets backing the answer's concepts (resolved via the registry). */
  readonly citations: readonly AssetObject[];
}

/** A neighbouring concept reached via a first-class Relationship. */
export interface RelatedConcept {
  readonly relationshipId: string;
  readonly relation: string;
  readonly direction: 'outgoing' | 'incoming';
  readonly otherId: CanonicalId;
}

/** How many top concepts an assembled answer draws from. */
const ANSWER_TOP_CONCEPTS = 1;

export class ResearchPortal {
  private readonly search: SearchService;
  private readonly knowledge: KnowledgeService;
  private readonly assets: AssetRegistryService;

  constructor(opts: ResearchPortalOptions) {
    this.search = opts.search;
    this.knowledge = opts.knowledge;
    this.assets = opts.assets;
  }

  /** Discover knowledge by query (delegates to Search). */
  semanticSearch(query: string, filters: SearchFilters = {}): readonly SearchHit[] {
    return this.search.search(query, filters);
  }

  /**
   * Assemble a deterministic, evidence-backed answer to a query. This is pure
   * composition (no inference): run Search over the indexed Knowledge, take the
   * top concept(s) that resolve to KnowledgeObjects, and resolve each concept's
   * `evidenceRefs` to Asset citations via the Asset Registry.
   */
  answerQuestion(query: string): Answer {
    const hits = this.search.search(query);
    const concepts: AnswerConcept[] = [];
    const citations: AssetObject[] = [];
    const seenCitations = new Set<CanonicalId>();

    for (const hit of hits) {
      if (concepts.length >= ANSWER_TOP_CONCEPTS) break;
      const ko = this.knowledge.getKnowledge(hit.subjectId);
      if (!ko) continue;
      concepts.push({
        id: ko.id,
        canonicalName: ko.body.canonicalName,
        definition: ko.body.definition,
      });
      for (const asset of this.resolveEvidence(ko)) {
        if (seenCitations.has(asset.id)) continue;
        seenCitations.add(asset.id);
        citations.push(asset);
      }
    }

    return { query, concepts, citations };
  }

  /**
   * Resolve a KnowledgeObject's evidence references to Assets via the Asset
   * Registry. Returns the Assets that exist in the registry (missing references
   * are skipped, not invented).
   */
  findCitations(knowledgeId: CanonicalId): readonly AssetObject[] {
    const ko = this.knowledge.getKnowledge(knowledgeId);
    if (!ko) return [];
    return this.resolveEvidence(ko);
  }

  /**
   * List the concepts linked to a node via its first-class Relationships, using
   * the Knowledge graph projection (like Knowledge Studio's navigate).
   */
  relatedConcepts(knowledgeId: CanonicalId): readonly RelatedConcept[] {
    const graph = this.knowledge.buildGraphProjection();
    const out: RelatedConcept[] = [];
    for (const edge of graph.edges.values()) {
      if (edge.sourceId === knowledgeId) {
        out.push({
          relationshipId: edge.relationshipId,
          relation: edge.relation,
          direction: 'outgoing',
          otherId: edge.targetId,
        });
      } else if (edge.targetId === knowledgeId) {
        out.push({
          relationshipId: edge.relationshipId,
          relation: edge.relation,
          direction: 'incoming',
          otherId: edge.sourceId,
        });
      }
    }
    return out;
  }

  /** Resolve a KnowledgeObject's evidence refs to Assets (registry lookup). */
  private resolveEvidence(ko: KnowledgeObject): readonly AssetObject[] {
    const assets: AssetObject[] = [];
    for (const ref of ko.body.provenance.evidenceRefs) {
      const asset = this.tryGetAsset(ref);
      if (asset) assets.push(asset);
    }
    return assets;
  }

  /** getAsset throws on a missing id; the portal treats absence as "no citation". */
  private tryGetAsset(id: CanonicalId): AssetObject | undefined {
    try {
      return this.assets.getAsset(id);
    } catch {
      return undefined;
    }
  }
}
