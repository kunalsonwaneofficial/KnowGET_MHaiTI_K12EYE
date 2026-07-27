import { describe, expect, it } from "vitest";
import type { TraceKind } from "./ai-value";
import type { TraceView } from "./ai-view";
import {
  decisionConfidence,
  evidenceChain,
  evidenceOf,
  groundSession,
  isTraceGrounded,
  summarizeSession,
  unsourcedRetrievalTraceIds,
} from "./reasoning";

const trace = (
  id: string,
  ordinal: number,
  kind: TraceKind,
  patch: Partial<TraceView> = {},
): TraceView => ({
  id,
  ordinal,
  kind,
  confidence: 90,
  knowledgeRefs: [],
  dependsOn: [],
  ...patch,
});

/** retrieval → inference → decision: the shape a well-founded session has. */
const founded: readonly TraceView[] = [
  trace("t1", 1, "retrieval", { knowledgeRefs: ["assertion-1", "assertion-2"] }),
  trace("t2", 2, "observation"),
  trace("t3", 3, "inference", { dependsOn: ["t1", "t2"] }),
  trace("t4", 4, "decision", { dependsOn: ["t3"] }),
];

describe("groundSession — a conclusion must rest on something", () => {
  it("measures a well-founded session", () => {
    expect(groundSession(founded)).toEqual({
      traceCount: 4,
      retrievalCount: 1,
      derivedCount: 2,
      groundedDerivedCount: 2,
      ungroundedTraceIds: [],
      knowledgeRefCount: 2,
      grounded: true,
    });
  });

  it("catches an inference that rests on nothing", () => {
    const grounding = groundSession([
      trace("t1", 1, "retrieval", { knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "inference"),
    ]);
    expect(grounding.ungroundedTraceIds).toEqual(["t2"]);
    expect(grounding.groundedDerivedCount).toBe(0);
    expect(grounding.grounded).toBe(false);
  });

  it("does not accept a step that cites a later step — evidence runs forwards", () => {
    const grounding = groundSession([
      trace("t1", 1, "decision", { dependsOn: ["t2"] }),
      trace("t2", 2, "retrieval", { knowledgeRefs: ["assertion-1"] }),
    ]);
    expect(grounding.ungroundedTraceIds).toEqual(["t1"]);
  });

  it("does not accept a step that cites itself", () => {
    const grounding = groundSession([trace("t1", 1, "inference", { dependsOn: ["t1"] })]);
    expect(grounding.ungroundedTraceIds).toEqual(["t1"]);
  });

  it("does not accept a step that cites something outside the session", () => {
    const grounding = groundSession([
      trace("t1", 1, "observation"),
      trace("t2", 2, "inference", { dependsOn: ["from-another-session"] }),
    ]);
    expect(grounding.ungroundedTraceIds).toEqual(["t2"]);
  });

  it("never calls a retrieval or an observation ungrounded — they bring the evidence in", () => {
    const grounding = groundSession([
      trace("t1", 1, "retrieval", { knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "observation"),
    ]);
    expect(grounding.ungroundedTraceIds).toEqual([]);
    expect(grounding.derivedCount).toBe(0);
    expect(grounding.grounded).toBe(true);
  });

  it("counts distinct knowledge references, not citations", () => {
    const grounding = groundSession([
      trace("t1", 1, "retrieval", { knowledgeRefs: ["assertion-1", "assertion-2"] }),
      trace("t2", 2, "retrieval", { knowledgeRefs: ["assertion-1", "entity-9"] }),
    ]);
    expect(grounding.knowledgeRefCount).toBe(3);
    expect(grounding.retrievalCount).toBe(2);
  });

  it("treats an empty session as vacuously grounded", () => {
    expect(groundSession([])).toEqual({
      traceCount: 0,
      retrievalCount: 0,
      derivedCount: 0,
      groundedDerivedCount: 0,
      ungroundedTraceIds: [],
      knowledgeRefCount: 0,
      grounded: true,
    });
  });
});

describe("evidenceOf / evidenceChain", () => {
  it("returns only what a step directly rests on", () => {
    expect(evidenceOf(founded, "t3").map((entry) => entry.id)).toEqual(["t1", "t2"]);
    expect(evidenceOf(founded, "t4").map((entry) => entry.id)).toEqual(["t3"]);
    expect(evidenceOf(founded, "t1")).toEqual([]);
  });

  it("walks the whole chain, in session order, without the step itself", () => {
    expect(evidenceChain(founded, "t4").map((entry) => entry.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("visits a shared step once when the evidence diamonds", () => {
    const diamond = [
      trace("t1", 1, "retrieval", { knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "inference", { dependsOn: ["t1"] }),
      trace("t3", 3, "inference", { dependsOn: ["t1"] }),
      trace("t4", 4, "decision", { dependsOn: ["t2", "t3"] }),
    ];
    expect(evidenceChain(diamond, "t4").map((entry) => entry.id)).toEqual(["t1", "t2", "t3"]);
  });

  it("returns nothing for a step that is not in the session", () => {
    expect(evidenceOf(founded, "ghost")).toEqual([]);
    expect(evidenceChain(founded, "ghost")).toEqual([]);
  });
});

describe("isTraceGrounded", () => {
  it("holds derived steps to the evidence rule and lets the others through", () => {
    expect(isTraceGrounded(founded, "t1")).toBe(true);
    expect(isTraceGrounded(founded, "t3")).toBe(true);
    expect(isTraceGrounded([trace("t1", 1, "decision")], "t1")).toBe(false);
  });

  it("is false for a step that is not in the session", () => {
    expect(isTraceGrounded(founded, "ghost")).toBe(false);
  });
});

describe("unsourcedRetrievalTraceIds", () => {
  it("names retrievals that brought no knowledge back", () => {
    const traces = [
      trace("t1", 1, "retrieval", { knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "retrieval"),
      trace("t3", 3, "observation"),
    ];
    expect(unsourcedRetrievalTraceIds(traces)).toEqual(["t2"]);
  });

  it("is empty when every retrieval cites the graph", () => {
    expect(unsourcedRetrievalTraceIds(founded)).toEqual([]);
  });
});

describe("decisionConfidence — weakest link, not average", () => {
  it("takes the weakest confidence in the chain a decision rests on", () => {
    const traces = [
      trace("t1", 1, "retrieval", { confidence: 100, knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "inference", { confidence: 42, dependsOn: ["t1"] }),
      trace("t3", 3, "decision", { confidence: 95, dependsOn: ["t2"] }),
    ];
    expect(decisionConfidence(traces)).toBe(42);
  });

  it("includes the decision's own confidence", () => {
    const traces = [
      trace("t1", 1, "retrieval", { confidence: 100, knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "decision", { confidence: 30, dependsOn: ["t1"] }),
    ];
    expect(decisionConfidence(traces)).toBe(30);
  });

  it("takes the weakest across every decision the session reached", () => {
    const traces = [
      trace("t1", 1, "retrieval", { confidence: 100, knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "decision", { confidence: 80, dependsOn: ["t1"] }),
      trace("t3", 3, "decision", { confidence: 55, dependsOn: ["t1"] }),
    ];
    expect(decisionConfidence(traces)).toBe(55);
  });

  it("is zero when a decision rests on nothing", () => {
    const traces = [
      trace("t1", 1, "retrieval", { confidence: 100, knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "decision", { confidence: 99 }),
    ];
    expect(decisionConfidence(traces)).toBe(0);
  });

  it("is zero when the session decided nothing", () => {
    expect(decisionConfidence([])).toBe(0);
    expect(decisionConfidence([trace("t1", 1, "retrieval", { knowledgeRefs: ["a"] })])).toBe(0);
  });

  it("clamps a confidence recorded outside the 0–100 band", () => {
    const high = [
      trace("t1", 1, "retrieval", { confidence: 140, knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "decision", { confidence: 90, dependsOn: ["t1"] }),
    ];
    expect(decisionConfidence(high)).toBe(90);

    const low = [
      trace("t1", 1, "retrieval", { confidence: -20, knowledgeRefs: ["assertion-1"] }),
      trace("t2", 2, "decision", { confidence: 90, dependsOn: ["t1"] }),
    ];
    expect(decisionConfidence(low)).toBe(0);
  });
});

describe("summarizeSession", () => {
  it("puts grounding, confidence and decision count together", () => {
    expect(summarizeSession(founded)).toEqual({
      grounding: groundSession(founded),
      decisionConfidence: 90,
      decisionCount: 1,
    });
  });
});
