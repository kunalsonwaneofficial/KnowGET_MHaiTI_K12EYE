import type { EntityDegree, Neighborhood, NeighborEdge, RelationshipView } from "./knowledge-view";

/**
 * The pure traversal engine — the structural half of the semantic layer. Given a set of relationships (already
 * resolved to the version/time the caller wants — see {@link resolveAsOf}), it computes an entity's immediate
 * neighbourhood, its degree, and a bounded reachable set. No clock, no store, no recursion into I/O — plain
 * graph structure. Built and tested before any aggregate depends on it.
 */

/**
 * An entity's immediate neighbourhood over the given edges: the entities it points to (out), the entities that
 * point to it (in), and its degree. Self-loops (source === target === entity) count once on each side, as they
 * are one edge that is both an out- and an in-relationship of the entity. Deterministic and order-preserving.
 */
export function neighborhood(
  entityId: string,
  relationships: readonly RelationshipView[],
): Neighborhood {
  const out: NeighborEdge[] = [];
  const inbound: NeighborEdge[] = [];
  for (const r of relationships) {
    if (r.sourceEntityId === entityId) {
      out.push({
        entityId: r.targetEntityId,
        relationshipTypeKey: r.relationshipTypeKey,
        direction: "out",
        relationshipId: r.id,
      });
    }
    if (r.targetEntityId === entityId) {
      inbound.push({
        entityId: r.sourceEntityId,
        relationshipTypeKey: r.relationshipTypeKey,
        direction: "in",
        relationshipId: r.id,
      });
    }
  }
  return { entityId, out, in: inbound, degree: out.length + inbound.length };
}

/** An entity's degree split (out / in / total) over the given edges. */
export function degreeOf(
  entityId: string,
  relationships: readonly RelationshipView[],
): EntityDegree {
  const n = neighborhood(entityId, relationships);
  return { entityId, outDegree: n.out.length, inDegree: n.in.length, degree: n.degree };
}

/**
 * The distinct entity ids directly connected to `entityId` (either direction), excluding itself. A
 * de-duplicated adjacency set — the input to a memory refresh or a one-hop expansion.
 */
export function connectedEntityIds(
  entityId: string,
  relationships: readonly RelationshipView[],
): string[] {
  const ids = new Set<string>();
  const n = neighborhood(entityId, relationships);
  for (const e of [...n.out, ...n.in]) {
    if (e.entityId !== entityId) {
      ids.add(e.entityId);
    }
  }
  return [...ids];
}

/**
 * The entities reachable from `entityId` within `maxHops` (undirected), excluding the start. A bounded
 * breadth-first walk — the bound guarantees termination even on a cyclic graph, and keeps "digital memory"
 * neighbourhood queries from fanning out across the whole graph. `maxHops <= 0` yields the empty set.
 */
export function reachableWithin(
  entityId: string,
  relationships: readonly RelationshipView[],
  maxHops: number,
): string[] {
  if (maxHops <= 0) {
    return [];
  }
  const seen = new Set<string>([entityId]);
  let frontier = [entityId];
  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of connectedEntityIds(id, relationships)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  seen.delete(entityId);
  return [...seen];
}
