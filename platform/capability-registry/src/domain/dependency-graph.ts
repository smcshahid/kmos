/**
 * Capability dependency graph + cycle detection (KMOS-0205 "DEPENDENCY
 * MANAGEMENT": circular dependencies SHALL be detected and rejected).
 *
 * Technique: directed graph + DFS three-colour cycle detection (Airflow's
 * acyclic-DAG rule; Backstage relation graph). Pure, deterministic, no IO.
 */

import type { CanonicalId } from '@kmos/canonical-kernel';

export type DependencyEdges = ReadonlyMap<CanonicalId, readonly CanonicalId[]>;

/** Return a cycle path if the graph (with `edges`) contains one, else undefined. */
export function findCycle(edges: DependencyEdges): readonly CanonicalId[] | undefined {
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colour = new Map<CanonicalId, number>();
  const stack: CanonicalId[] = [];

  const visit = (node: CanonicalId): readonly CanonicalId[] | undefined => {
    colour.set(node, GREY);
    stack.push(node);
    for (const next of edges.get(node) ?? []) {
      const c = colour.get(next) ?? WHITE;
      if (c === GREY) {
        const from = stack.indexOf(next);
        return [...stack.slice(from), next];
      }
      if (c === WHITE) {
        const found = visit(next);
        if (found) return found;
      }
    }
    colour.set(node, BLACK);
    stack.pop();
    return undefined;
  };

  for (const node of edges.keys()) {
    if ((colour.get(node) ?? WHITE) === WHITE) {
      const found = visit(node);
      if (found) return found;
    }
  }
  return undefined;
}

/** Transitive dependencies of a node (excluding itself). */
export function transitiveDependencies(edges: DependencyEdges, node: CanonicalId): Set<CanonicalId> {
  const out = new Set<CanonicalId>();
  const stack = [...(edges.get(node) ?? [])];
  while (stack.length > 0) {
    const n = stack.pop() as CanonicalId;
    if (out.has(n)) continue;
    out.add(n);
    for (const d of edges.get(n) ?? []) stack.push(d);
  }
  return out;
}
