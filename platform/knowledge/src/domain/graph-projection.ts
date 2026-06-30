/**
 * Semantic graph projection (KMOS-0201 §12).
 *
 * The graph is a PROJECTION, never the system of record. Nodes are derived from
 * authoritative KnowledgeObjects (and Concepts) and edges from authoritative
 * first-class Relationship objects. Because it is derived, it can be discarded
 * and regenerated at any time from the authoritative store — proven by the
 * service test. This module contains only pure, deterministic derivation logic
 * (no clocks, no IO), so it is equally usable when folding the event log via the
 * kernel `replay`/`Projection` machinery.
 */

import type { StoredEvent, Projection } from '@kmos/canonical-kernel';
import type {
  GraphEdge,
  GraphNode,
  KnowledgeGraph,
  KnowledgeObject,
  RelationshipObject,
} from './types.js';

/** Derive a graph node from an authoritative KnowledgeObject head. */
export function nodeOf(ko: KnowledgeObject): GraphNode {
  return {
    id: ko.id,
    type: ko.type,
    category: ko.body.category,
    canonicalName: ko.body.canonicalName,
    version: ko.version,
    lifecycle: ko.lifecycle,
    confidence: ko.body.provenance.confidence,
    unverified: ko.body.provenance.unverified,
  };
}

/** Derive a graph edge from an authoritative Relationship object head. */
export function edgeOf(rel: RelationshipObject): GraphEdge {
  return {
    relationshipId: rel.id,
    relation: rel.body.relation,
    sourceId: rel.body.sourceId,
    targetId: rel.body.targetId,
    confidence: rel.body.provenance.confidence,
  };
}

/**
 * Build the graph from authoritative object heads. This is the canonical,
 * repository-sourced derivation used by the service.
 */
export function buildGraph(
  knowledge: readonly KnowledgeObject[],
  relationships: readonly RelationshipObject[],
): KnowledgeGraph {
  return {
    nodes: knowledge.map(nodeOf),
    edges: relationships.map(edgeOf),
  };
}

/** Internal accumulator state for the event-sourced graph projection. */
interface GraphState {
  /** id -> latest node (later events for the same id win). */
  readonly nodes: Map<string, GraphNode>;
  /** relationshipId -> latest edge. */
  readonly edges: Map<string, GraphEdge>;
}

/**
 * A kernel `Projection` that rebuilds the same graph purely by folding the
 * immutable event log. Used to demonstrate the graph is regenerable from the
 * authoritative event history (KMOS-0201 §12; replay determinism, Constitution
 * §6). KnowledgeCreated/KnowledgeUpdated/ConceptCreated mutate nodes;
 * RelationshipEstablished adds edges; KnowledgeArchived updates node lifecycle.
 */
export const graphProjection: Projection<GraphState> = {
  name: 'knowledge-graph',
  initial: () => ({ nodes: new Map(), edges: new Map() }),
  apply: (state, stored: StoredEvent): GraphState => {
    const { type } = stored.event.identity;
    const p = stored.event.payload as Record<string, unknown>;
    if (type === 'KnowledgeCreated' || type === 'ConceptCreated' || type === 'KnowledgeUpdated') {
      const node = p['node'] as GraphNode | undefined;
      if (node) state.nodes.set(node.id, node);
    } else if (type === 'KnowledgeArchived') {
      const id = p['knowledgeId'] as string | undefined;
      const existing = id ? state.nodes.get(id) : undefined;
      if (existing) state.nodes.set(existing.id, { ...existing, lifecycle: 'Archived' });
    } else if (type === 'RelationshipEstablished') {
      const edge = p['edge'] as GraphEdge | undefined;
      if (edge) state.edges.set(edge.relationshipId, edge);
    }
    return state;
  },
};

/** Convert event-sourced projection state into a plain KnowledgeGraph. */
export function graphFromState(state: { nodes: Map<string, GraphNode>; edges: Map<string, GraphEdge> }): KnowledgeGraph {
  return { nodes: [...state.nodes.values()], edges: [...state.edges.values()] };
}
