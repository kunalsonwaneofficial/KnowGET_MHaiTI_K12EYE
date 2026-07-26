import { describe, expect, it } from "vitest";
import type { AssertionView, RelationshipView } from "./knowledge-view";
import type { AssertionMethod } from "./knowledge-value";
import { entityMemory, summarizeGraph } from "./metrics";

const edge = (
  id: string,
  s: string,
  t: string,
  type = "knows",
  status = "asserted",
): RelationshipView => ({
  id,
  relationshipTypeKey: type,
  sourceEntityId: s,
  targetEntityId: t,
  validFrom: "2026-01-01",
  validTo: null,
  version: 1,
  status,
});
const a = (
  id: string,
  method: AssertionMethod,
  confidence: number,
  derivedFrom: string[] = [],
  status = "asserted",
): AssertionView => ({
  id,
  method,
  confidence,
  derivedFrom,
  status,
});

describe("metrics engine", () => {
  it("summarizes counts, per-type breakdowns and average degree", () => {
    const s = summarizeGraph(
      ["a", "b", "c"],
      ["person", "person", "org"],
      [
        edge("1", "a", "b", "knows"),
        edge("2", "a", "c", "member_of"),
        edge("3", "b", "c", "knows", "retracted"),
      ],
      [a("o", "observed", 90), a("d", "derived", 80, ["o"])],
    );
    expect(s.entityCount).toBe(3);
    expect(s.relationshipCount).toBe(2); // retracted excluded
    expect(s.assertionCount).toBe(2);
    expect(s.entitiesByType).toEqual([
      { key: "org", count: 1 },
      { key: "person", count: 2 },
    ]);
    expect(s.relationshipsByType).toEqual([
      { key: "knows", count: 1 },
      { key: "member_of", count: 1 },
    ]);
    expect(s.groundedAssertions).toBe(1);
    expect(s.derivedAssertions).toBe(1);
    expect(s.averageDegree).toBe(1.33); // 2*2/3 = 1.333 → 1.33
  });

  it("average degree is 0 for an empty node set", () => {
    expect(summarizeGraph([], [], [], []).averageDegree).toBe(0);
  });

  it("summary counts only standing assertions (retracted excluded)", () => {
    const s = summarizeGraph(
      ["a"],
      ["person"],
      [],
      [
        a("o", "observed", 90),
        a("r", "declared", 50, [], "retracted"),
        a("d", "derived", 80, ["o"]),
      ],
    );
    expect(s.assertionCount).toBe(2); // the retracted one is withdrawn
    expect(s.groundedAssertions).toBe(1); // only the standing observed
    expect(s.derivedAssertions).toBe(1);
  });

  it("computes per-entity memory: degree, assertion counts and aggregate confidence", () => {
    const live = [edge("1", "a", "b"), edge("2", "c", "a")];
    const pool = [a("o1", "observed", 90), a("d1", "derived", 100, ["o1"])];
    const mem = entityMemory("a", live, pool, pool);
    expect(mem).toMatchObject({
      outDegree: 1,
      inDegree: 1,
      degree: 2,
      assertionCount: 2,
      groundedAssertionCount: 1,
    });
    // effective confidences: o1=90, d1=min(100,90)=90 → weakest-link aggregate = 90
    expect(mem.aggregateConfidence).toBe(90);
  });

  it("ignores retracted assertions in memory", () => {
    const pool = [a("o1", "observed", 90), a("r", "declared", 50, [], "retracted")];
    const mem = entityMemory("a", [], pool, pool);
    expect(mem.assertionCount).toBe(1);
    expect(mem.aggregateConfidence).toBe(90);
  });
});
