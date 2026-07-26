import type {
  AssertionView,
  EntityMemoryView,
  GraphSummary,
  KeyCount,
  RelationshipView,
} from "./knowledge-view";
import { isGroundedMethod } from "./knowledge-value";
import { effectiveConfidence, aggregateConfidence } from "./provenance";
import { degreeOf } from "./traversal";

/**
 * The pure metrics engine — descriptive graph indicators and the per-entity "digital memory" the refresh spine
 * persists. Every number here is a count or a count-derived index over the structure the other engines produce;
 * nothing is predictive (forecasting is P2-D28) and nothing calls a model. Pure and deterministic.
 */

/** Tally a set of keys into a stable, key-sorted key→count roll-up. */
function tally(keys: readonly string[]): KeyCount[] {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * A descriptive summary of a graph slice: how many entities / relationships / assertions, the per-type
 * breakdowns, the grounded-vs-derived assertion split, and the average degree (2 × edges / entities — each edge
 * touches two endpoints). `entityIds` is the node set; only `asserted` relationships count as live edges.
 */
export function summarizeGraph(
  entityIds: readonly string[],
  entityTypeKeys: readonly string[],
  relationships: readonly RelationshipView[],
  assertions: readonly AssertionView[],
): GraphSummary {
  const live = relationships.filter((r) => r.status === "asserted");
  const grounded = assertions.filter((a) => isGroundedMethod(a.method)).length;
  const entityCount = entityIds.length;
  return {
    entityCount,
    relationshipCount: live.length,
    assertionCount: assertions.length,
    entitiesByType: tally(entityTypeKeys),
    relationshipsByType: tally(live.map((r) => r.relationshipTypeKey)),
    groundedAssertions: grounded,
    derivedAssertions: assertions.length - grounded,
    averageDegree: entityCount > 0 ? Math.round((2 * live.length * 100) / entityCount) / 100 : 0,
  };
}

/**
 * The per-entity digital memory: how connected the entity is (degree, over the live edges the caller passes),
 * how much still stands about it (asserted assertions), how much of that is grounded, and the aggregate
 * confidence of its standing assertions (each taken at its evidence-chain-capped effective confidence, then
 * combined by the weakest-link rule). `entityAssertions` are the assertions whose subject is this entity;
 * `allAssertions` is the pool their evidence chains resolve against.
 */
export function entityMemory(
  entityId: string,
  liveRelationships: readonly RelationshipView[],
  entityAssertions: readonly AssertionView[],
  allAssertions: readonly AssertionView[],
): EntityMemoryView {
  const d = degreeOf(entityId, liveRelationships);
  const standing = entityAssertions.filter((a) => a.status === "asserted");
  const grounded = standing.filter((a) => isGroundedMethod(a.method)).length;
  const confidences = standing.map((a) => effectiveConfidence(a.id, allAssertions));
  return {
    outDegree: d.outDegree,
    inDegree: d.inDegree,
    degree: d.degree,
    assertionCount: standing.length,
    groundedAssertionCount: grounded,
    aggregateConfidence: aggregateConfidence(confidences),
  };
}
