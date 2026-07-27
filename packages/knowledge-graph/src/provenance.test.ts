import { describe, expect, it } from "vitest";
import type { AssertionView } from "./knowledge-view";
import type { AssertionMethod } from "./knowledge-value";
import {
  aggregateConfidence,
  effectiveConfidence,
  evidenceChain,
  explain,
  isExplainable,
} from "./provenance";

const a = (
  id: string,
  method: AssertionMethod,
  confidence: number,
  derivedFrom: string[] = [],
): AssertionView => ({ id, method, confidence, derivedFrom, status: "asserted" });

describe("provenance engine — evidence chain + explainability", () => {
  // observed(o1)=90, observed(o2)=80  →  derived(d1) from [o1,o2]=95  →  inferred(i1) from [d1]=100
  const pool = [
    a("o1", "observed", 90),
    a("o2", "declared", 80),
    a("d1", "derived", 95, ["o1", "o2"]),
    a("i1", "inferred", 100, ["d1"]),
  ];

  it("explains a grounded assertion as a leaf", () => {
    const tree = explain("o1", pool);
    expect(tree).toMatchObject({ id: "o1", grounded: true, derivedFrom: [] });
  });

  it("builds the derivation tree for a derived assertion", () => {
    const tree = explain("i1", pool);
    expect(tree?.grounded).toBe(false);
    expect(tree?.derivedFrom).toHaveLength(1); // i1 ← d1
    expect(tree?.derivedFrom[0]?.derivedFrom.map((c) => c.id).sort()).toEqual(["o1", "o2"]);
  });

  it("returns null for an unknown root", () => {
    expect(explain("nope", pool)).toBeNull();
  });

  it("resolves the evidence chain to the grounded roots", () => {
    expect(evidenceChain("i1", pool).sort()).toEqual(["o1", "o2"]);
    expect(evidenceChain("o1", pool)).toEqual(["o1"]);
  });

  it("marks fully-grounded assertions explainable", () => {
    expect(isExplainable("i1", pool)).toBe(true);
    expect(isExplainable("d1", pool)).toBe(true);
    expect(isExplainable("o1", pool)).toBe(true);
  });

  it("flags a derived assertion that grounds nowhere as NOT explainable", () => {
    const dangling = [a("bad", "derived", 100)]; // derived but cites nothing
    expect(isExplainable("bad", dangling)).toBe(false);
    expect(evidenceChain("bad", dangling)).toEqual([]);
  });

  it("flags a missing antecedent as NOT explainable", () => {
    const pool2 = [a("d", "derived", 100, ["ghost"])];
    const tree = explain("d", pool2);
    expect(tree?.derivedFrom[0]?.unresolved).toBe("missing");
    expect(isExplainable("d", pool2)).toBe(false);
  });

  it("cuts a cycle and terminates", () => {
    // x ← y ← x  (mutual derivation)
    const cyc = [a("x", "derived", 100, ["y"]), a("y", "inferred", 100, ["x"])];
    const tree = explain("x", cyc);
    expect(tree).not.toBeNull();
    // somewhere down the branch the cycle is cut
    const cut = tree?.derivedFrom[0]?.derivedFrom[0];
    expect(cut?.unresolved).toBe("cycle");
    expect(isExplainable("x", cyc)).toBe(false);
  });

  it("aggregateConfidence takes the weakest link (0 for empty)", () => {
    expect(aggregateConfidence([90, 80, 95])).toBe(80);
    expect(aggregateConfidence([])).toBe(0);
    expect(aggregateConfidence([120])).toBe(100); // clamped
  });

  it("effectiveConfidence caps a conclusion at its weakest evidence", () => {
    // i1 declares 100 but rests on o2=80 (the weakest grounded root) → capped at 80
    expect(effectiveConfidence("i1", pool)).toBe(80);
    expect(effectiveConfidence("o1", pool)).toBe(90); // grounded keeps its own
    expect(effectiveConfidence("d1", pool)).toBe(80); // min(95, 90, 80)
  });

  it("effectiveConfidence is 0 for an unexplainable assertion", () => {
    expect(effectiveConfidence("bad", [a("bad", "derived", 100)])).toBe(0);
  });

  it("treats a retracted antecedent as withdrawn evidence", () => {
    const withRetracted = [
      {
        id: "o1",
        method: "observed" as const,
        confidence: 90,
        derivedFrom: [],
        status: "retracted",
      },
      {
        id: "d1",
        method: "derived" as const,
        confidence: 100,
        derivedFrom: ["o1"],
        status: "asserted",
      },
    ];
    // d1 rests only on a retracted fact → no longer explainable, no evidence, 0 effective confidence
    expect(isExplainable("d1", withRetracted)).toBe(false);
    expect(evidenceChain("d1", withRetracted)).toEqual([]);
    expect(effectiveConfidence("d1", withRetracted)).toBe(0);
    // explaining the retracted root itself still shows it (as a grounded leaf)
    expect(explain("o1", withRetracted)?.grounded).toBe(true);
  });
});
