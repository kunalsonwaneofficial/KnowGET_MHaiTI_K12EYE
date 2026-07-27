import { describe, expect, it } from "vitest";
import type { RelationshipView } from "./knowledge-view";
import { connectedEntityIds, degreeOf, neighborhood, reachableWithin } from "./traversal";

const edge = (id: string, source: string, target: string): RelationshipView => ({
  id,
  relationshipTypeKey: "knows",
  sourceEntityId: source,
  targetEntityId: target,
  validFrom: "2026-01-01",
  validTo: null,
  version: 1,
  status: "asserted",
});

// a → b, a → c, d → a  (a chain b←a→c with d pointing at a)
const graph = [edge("e1", "a", "b"), edge("e2", "a", "c"), edge("e3", "d", "a")];

describe("traversal engine", () => {
  it("computes out/in neighbourhood and degree", () => {
    const n = neighborhood("a", graph);
    expect(n.out.map((e) => e.entityId).sort()).toEqual(["b", "c"]);
    expect(n.in.map((e) => e.entityId)).toEqual(["d"]);
    expect(n.degree).toBe(3);
  });

  it("splits degree out/in/total", () => {
    expect(degreeOf("a", graph)).toEqual({ entityId: "a", outDegree: 2, inDegree: 1, degree: 3 });
  });

  it("de-duplicates connected ids and excludes self", () => {
    expect(connectedEntityIds("a", graph).sort()).toEqual(["b", "c", "d"]);
  });

  it("counts a self-loop once on each side", () => {
    const n = neighborhood("x", [edge("self", "x", "x")]);
    expect(n.out).toHaveLength(1);
    expect(n.in).toHaveLength(1);
    expect(connectedEntityIds("x", [edge("self", "x", "x")])).toEqual([]); // self excluded
  });

  it("reachableWithin is bounded and cycle-safe", () => {
    // a→b→c→a cycle plus c→e
    const cyc = [
      edge("1", "a", "b"),
      edge("2", "b", "c"),
      edge("3", "c", "a"),
      edge("4", "c", "e"),
    ];
    expect(reachableWithin("a", cyc, 0)).toEqual([]);
    expect(reachableWithin("a", cyc, 1).sort()).toEqual(["b", "c"]); // undirected 1-hop
    expect(reachableWithin("a", cyc, 5).sort()).toEqual(["b", "c", "e"]); // terminates despite cycle
  });
});
