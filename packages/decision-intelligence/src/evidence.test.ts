import { describe, expect, it } from "vitest";
import {
  chainConfidence,
  dependentClosure,
  evidenceIssueCodes,
  evidenceRootIds,
  graphRootIds,
  inspectEvidenceChain,
  isChainGrounded,
  summarizeRecommendationEvidence,
  supportClosure,
  weakestStrength,
} from "./evidence";
import type { EvidenceIssueCode, EvidenceRefView } from "./decision-view";

const ev = (patch: Partial<EvidenceRefView> & { id: string }): EvidenceRefView => ({
  source: "knowledge_graph",
  ref: "entity-attendance-1",
  strength: "strong",
  supports: [],
  ...patch,
});

const codes = (evidence: readonly EvidenceRefView[]): readonly EvidenceIssueCode[] =>
  evidenceIssueCodes(inspectEvidenceChain(evidence));

describe("a recommendation with no evidence", () => {
  it("is not grounded, and says so with a code rather than an empty summary", () => {
    const summary = inspectEvidenceChain([]);
    expect(summary.grounded).toBe(false);
    expect(summary.issues).toEqual([{ evidenceId: null, code: "no_evidence", ref: null }]);
  });

  it("carries no confidence at all", () => {
    expect(chainConfidence([])).toBe(0);
    expect(weakestStrength([])).toBeNull();
  });

  it("reports zeroes rather than nulls for every count", () => {
    const summary = inspectEvidenceChain([]);
    expect(summary.evidenceCount).toBe(0);
    expect(summary.rootCount).toBe(0);
    expect(summary.graphRootCount).toBe(0);
    expect(summary.sessionCount).toBe(0);
    expect(summary.maxDepth).toBe(0);
  });

  it("does not also complain that it has no graph root — one code, one fault", () => {
    expect(codes([])).toEqual(["no_evidence"]);
  });
});

describe("bottoming out in the knowledge graph", () => {
  it("grounds a recommendation on a single graph assertion", () => {
    const summary = inspectEvidenceChain([ev({ id: "e1" })]);
    expect(summary.grounded).toBe(true);
    expect(summary.issues).toEqual([]);
    expect(summary.graphRootCount).toBe(1);
    expect(summary.maxDepth).toBe(1);
  });

  it("refuses a chain made only of reasoning about reasoning", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "s1", source: "reasoning_session", ref: "session-1" }),
      ev({ id: "s2", source: "reasoning_session", ref: "session-2", supports: ["s1"] }),
    ]);
    expect(summary.grounded).toBe(false);
    expect(
      codes([
        ev({ id: "s1", source: "reasoning_session" }),
        ev({ id: "s2", source: "reasoning_session", supports: ["s1"] }),
      ]),
    ).toEqual(["no_graph_root"]);
    expect(summary.sessionCount).toBe(2);
  });

  it("grounds a reasoning session that rests on the graph", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "e1" }),
      ev({ id: "s1", source: "reasoning_session", ref: "session-1", supports: ["e1"] }),
    ]);
    expect(summary.grounded).toBe(true);
    expect(summary.graphRootCount).toBe(1);
    expect(summary.sessionCount).toBe(1);
    expect(summary.maxDepth).toBe(2);
  });

  it("does not count a session as a root just because it rests on nothing", () => {
    const evidence = [
      ev({ id: "e1" }),
      ev({ id: "s1", source: "reasoning_session", supports: [] }),
    ];
    expect(evidenceRootIds(evidence)).toEqual(["e1", "s1"]);
    expect(graphRootIds(evidence)).toEqual(["e1"]);
  });
});

describe("confidence is the weakest link", () => {
  it("takes the weakest strength in the chain, not the average", () => {
    const evidence = [
      ev({ id: "e1", strength: "weak" }),
      ev({ id: "e2", strength: "strong", supports: ["e1"] }),
      ev({ id: "e3", strength: "strong", supports: ["e2"] }),
    ];
    expect(weakestStrength(evidence)).toBe("weak");
    expect(chainConfidence(evidence)).toBe(30);
  });

  it("cannot be raised by piling on strong citations", () => {
    const weakLink = ev({ id: "e1", strength: "weak" });
    const one = chainConfidence([weakLink]);
    const many = chainConfidence([
      weakLink,
      ev({ id: "e2", strength: "strong" }),
      ev({ id: "e3", strength: "strong" }),
      ev({ id: "e4", strength: "strong" }),
    ]);
    expect(many).toBe(one);
  });

  it.each([
    ["weak", 30],
    ["moderate", 65],
    ["strong", 90],
  ] as const)("maps a %s chain to %i", (strength, expected) => {
    expect(chainConfidence([ev({ id: "e1", strength })])).toBe(expected);
  });

  it("reports zero for an unsound chain rather than a reduced number", () => {
    const summary = inspectEvidenceChain([ev({ id: "e1", supports: ["missing"] })]);
    expect(summary.grounded).toBe(false);
    expect(summary.confidence).toBe(0);
  });
});

describe("supports that resolve to nothing", () => {
  it("names the piece and the id it could not find", () => {
    const summary = inspectEvidenceChain([ev({ id: "e1" }), ev({ id: "e2", supports: ["ghost"] })]);
    expect(summary.issues).toContainEqual({
      evidenceId: "e2",
      code: "unknown_support",
      ref: "ghost",
    });
    expect(summary.grounded).toBe(false);
  });

  it("reports one issue per dangling reference", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "e1" }),
      ev({ id: "e2", supports: ["ghost-a", "ghost-b"] }),
    ]);
    expect(summary.issues.filter((entry) => entry.code === "unknown_support")).toHaveLength(2);
  });
});

describe("a chain that rests on itself", () => {
  it("reports self-support rather than a cycle — they are different mistakes", () => {
    expect(codes([ev({ id: "e1", supports: ["e1"] })])).not.toContain("support_cycle");
    expect(codes([ev({ id: "e1", supports: ["e1"] })])).toContain("self_support");
  });

  it("is not a root either — a piece naming itself rests on something, however uselessly", () => {
    expect(codes([ev({ id: "e1", supports: ["e1"] })])).toEqual(["no_graph_root", "self_support"]);
  });

  it("still settles a depth, so one bad piece does not swallow the rest of the chain", () => {
    const summary = inspectEvidenceChain([ev({ id: "e1", supports: ["e1"] })]);
    expect(summary.maxDepth).toBe(1);
    expect(summary.grounded).toBe(false);
  });
});

describe("a chain that loops", () => {
  it("finds a two-piece cycle and names both pieces", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "e1", supports: ["e2"] }),
      ev({ id: "e2", supports: ["e1"] }),
    ]);
    expect(summary.issues.filter((entry) => entry.code === "support_cycle")).toEqual([
      { evidenceId: "e1", code: "support_cycle", ref: null },
      { evidenceId: "e2", code: "support_cycle", ref: null },
    ]);
    expect(summary.grounded).toBe(false);
  });

  it("finds a longer cycle without walking round it", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "a", supports: ["c"] }),
      ev({ id: "b", supports: ["a"] }),
      ev({ id: "c", supports: ["b"] }),
    ]);
    expect(summary.issues.map((entry) => entry.evidenceId)).toEqual([null, "a", "b", "c"]);
    expect(
      codes([
        ev({ id: "a", supports: ["c"] }),
        ev({ id: "b", supports: ["a"] }),
        ev({ id: "c", supports: ["b"] }),
      ]),
    ).toEqual(["no_graph_root", "support_cycle"]);
  });

  it("leaves the sound part of the chain alone", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "root" }),
      ev({ id: "x", supports: ["y"] }),
      ev({ id: "y", supports: ["x"] }),
    ]);
    expect(summary.issues.filter((entry) => entry.code === "support_cycle")).toHaveLength(2);
    expect(summary.maxDepth).toBe(1);
    expect(summary.graphRootCount).toBe(1);
  });

  it("has no graph root when every piece is inside the loop", () => {
    expect(
      inspectEvidenceChain([ev({ id: "e1", supports: ["e2"] }), ev({ id: "e2", supports: ["e1"] })])
        .rootCount,
    ).toBe(0);
  });
});

describe("chain depth", () => {
  it("is one for a flat set of citations", () => {
    expect(inspectEvidenceChain([ev({ id: "a" }), ev({ id: "b" }), ev({ id: "c" })]).maxDepth).toBe(
      1,
    );
  });

  it("counts the longest path, not the number of pieces", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "a" }),
      ev({ id: "b" }),
      ev({ id: "c", supports: ["a", "b"] }),
      ev({ id: "d", supports: ["c"] }),
    ]);
    expect(summary.evidenceCount).toBe(4);
    expect(summary.rootCount).toBe(2);
    expect(summary.maxDepth).toBe(3);
  });

  it("does not depend on the order the pieces are given in", () => {
    const forwards = inspectEvidenceChain([
      ev({ id: "a" }),
      ev({ id: "b", supports: ["a"] }),
      ev({ id: "c", supports: ["b"] }),
    ]);
    const backwards = inspectEvidenceChain([
      ev({ id: "c", supports: ["b"] }),
      ev({ id: "b", supports: ["a"] }),
      ev({ id: "a" }),
    ]);
    expect(backwards.maxDepth).toBe(forwards.maxDepth);
    expect(backwards.grounded).toBe(forwards.grounded);
  });
});

describe("issues are deterministic", () => {
  it("sorts them by code, then by the piece that carries them", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "z", source: "reasoning_session", supports: ["ghost"] }),
      ev({ id: "a", source: "reasoning_session", supports: ["a"] }),
    ]);
    expect(summary.issues).toEqual([
      { evidenceId: null, code: "no_graph_root", ref: null },
      { evidenceId: "a", code: "self_support", ref: "a" },
      { evidenceId: "z", code: "unknown_support", ref: "ghost" },
    ]);
  });

  it("produces the same summary for the same chain every time", () => {
    const evidence = [ev({ id: "a" }), ev({ id: "b", supports: ["a"] })];
    expect(inspectEvidenceChain(evidence)).toEqual(inspectEvidenceChain(evidence));
  });

  it("de-duplicates codes when it reduces them for an event", () => {
    const summary = inspectEvidenceChain([
      ev({ id: "a", supports: ["ghost-a"] }),
      ev({ id: "b", supports: ["ghost-b"] }),
    ]);
    expect(summary.issues).toHaveLength(3);
    expect(evidenceIssueCodes(summary)).toEqual(["no_graph_root", "unknown_support"]);
  });
});

describe("what a piece of evidence rests on", () => {
  const evidence = [
    ev({ id: "a" }),
    ev({ id: "b" }),
    ev({ id: "c", supports: ["a", "b"] }),
    ev({ id: "d", supports: ["c", "ghost"] }),
  ];

  it("walks the whole chain beneath it, sorted", () => {
    expect(supportClosure(evidence, "d")).toEqual(["a", "b", "c"]);
  });

  it("is empty for a root", () => {
    expect(supportClosure(evidence, "a")).toEqual([]);
  });

  it("omits ids the chain names but does not contain", () => {
    expect(supportClosure(evidence, "d")).not.toContain("ghost");
  });

  it("is empty for an id that is not in the chain at all", () => {
    expect(supportClosure(evidence, "nobody")).toEqual([]);
  });

  it("terminates on a cycle instead of walking round it", () => {
    const looped = [ev({ id: "x", supports: ["y"] }), ev({ id: "y", supports: ["x"] })];
    expect(supportClosure(looped, "x")).toEqual(["y"]);
  });
});

describe("what rests on a piece of evidence", () => {
  const evidence = [
    ev({ id: "a" }),
    ev({ id: "b", supports: ["a"] }),
    ev({ id: "c", supports: ["b"] }),
    ev({ id: "d" }),
  ];

  it("names everything that would lose its footing, sorted", () => {
    expect(dependentClosure(evidence, "a")).toEqual(["b", "c"]);
  });

  it("is empty for a piece nothing rests on", () => {
    expect(dependentClosure(evidence, "c")).toEqual([]);
    expect(dependentClosure(evidence, "d")).toEqual([]);
  });

  it("terminates on a cycle", () => {
    const looped = [ev({ id: "x", supports: ["y"] }), ev({ id: "y", supports: ["x"] })];
    expect(dependentClosure(looped, "x")).toEqual(["y"]);
  });
});

describe("the shape the rest of the domain reads", () => {
  it("summarizes the chain a recommendation carries", () => {
    const summary = summarizeRecommendationEvidence({
      id: "rec-1",
      status: "proposed",
      evidence: [ev({ id: "a", strength: "moderate" })],
    });
    expect(summary.grounded).toBe(true);
    expect(summary.confidence).toBe(65);
  });

  it("answers grounded with a boolean for the autonomy gate", () => {
    expect(isChainGrounded([ev({ id: "a" })])).toBe(true);
    expect(isChainGrounded([])).toBe(false);
    expect(isChainGrounded([ev({ id: "a", source: "reasoning_session" })])).toBe(false);
  });
});
