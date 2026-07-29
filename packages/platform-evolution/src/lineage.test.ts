import { describe, expect, it } from "vitest";
import {
  INITIATIVE_STATUSES,
  SIGNAL_STATUSES,
  isTerminalInitiativeStatus,
} from "./evolution-value";
import type { LineageChain, LineageStage } from "./evolution-view";
import { LINEAGE_STAGES, lineageStageRank, traceLineage } from "./lineage";

const chain = (overrides: Partial<LineageChain> = {}): LineageChain => ({
  signals: [{ status: "accepted", evidenceCited: 2 }],
  initiativeStatus: "adopted",
  gates: [{ gate: "approval", outcome: "satisfied" }],
  lessons: [{ retention: "retained" }],
  ...overrides,
});

const codes = (gaps: readonly { code: string }[]): string[] => gaps.map((gap) => gap.code);

describe("LINEAGE_STAGES", () => {
  it("runs from no account at all to a lesson in memory", () => {
    expect(LINEAGE_STAGES).toEqual([
      "unrecorded",
      "evidence",
      "signal",
      "decision",
      "outcome",
      "memory",
    ]);
  });

  it("is frozen, so the ladder cannot be reordered at runtime", () => {
    expect(Object.isFrozen(LINEAGE_STAGES)).toBe(true);
    expect(() => (LINEAGE_STAGES as LineageStage[]).push("unrecorded")).toThrow(TypeError);
  });

  it("names every stage exactly once", () => {
    expect(new Set(LINEAGE_STAGES).size).toBe(LINEAGE_STAGES.length);
  });
});

describe("lineageStageRank", () => {
  it("puts no account at all at the bottom", () => {
    expect(lineageStageRank("unrecorded")).toBe(0);
  });

  it("ranks the stages strictly ascending in declared order", () => {
    for (let i = 1; i < LINEAGE_STAGES.length; i += 1) {
      const previous = LINEAGE_STAGES[i - 1]!;
      const current = LINEAGE_STAGES[i]!;
      expect(lineageStageRank(current)).toBeGreaterThan(lineageStageRank(previous));
    }
  });

  it("puts memory above everything else", () => {
    for (const stage of LINEAGE_STAGES) {
      if (stage !== "memory") {
        expect(lineageStageRank("memory")).toBeGreaterThan(lineageStageRank(stage));
      }
    }
  });
});

describe("traceLineage", () => {
  it("reads a complete chain all the way back to memory", () => {
    const verdict = traceLineage(chain());
    expect(verdict.traceable).toBe(true);
    expect(verdict.reachedStage).toBe("memory");
    expect(verdict.gaps).toEqual([]);
  });

  it("reports a change nothing links back to as unrecorded", () => {
    const verdict = traceLineage(chain({ signals: [] }));
    expect(verdict.traceable).toBe(false);
    expect(verdict.reachedStage).toBe("unrecorded");
    expect(codes(verdict.gaps)).toContain("no_signal");
  });

  it("stops at unrecorded when a signal cites nothing, and says which one", () => {
    const verdict = traceLineage(
      chain({
        signals: [
          { status: "accepted", evidenceCited: 2 },
          { status: "accepted", evidenceCited: 0 },
        ],
      }),
    );
    expect(verdict.reachedStage).toBe("unrecorded");
    expect(verdict.gaps).toContainEqual({ code: "signal_without_evidence", linkIndex: 1 });
  });

  it("reaches evidence but no further when nothing was ever taken up", () => {
    const verdict = traceLineage(chain({ signals: [{ status: "raised", evidenceCited: 1 }] }));
    expect(verdict.reachedStage).toBe("evidence");
    expect(codes(verdict.gaps)).toContain("signal_not_taken_up");
  });

  it("counts a merged signal as taken up, the same as an accepted one", () => {
    const verdict = traceLineage(chain({ signals: [{ status: "merged", evidenceCited: 1 }] }));
    expect(verdict.reachedStage).toBe("memory");
  });

  it("counts a declined signal as filed rather than taken up", () => {
    const verdict = traceLineage(chain({ signals: [{ status: "declined", evidenceCited: 1 }] }));
    expect(verdict.reachedStage).toBe("evidence");
  });

  it("stops at signal when no gate has settled, and says which gate is open", () => {
    const verdict = traceLineage(chain({ gates: [{ gate: "approval", outcome: "pending" }] }));
    expect(verdict.reachedStage).toBe("signal");
    expect(verdict.gaps).toContainEqual({ code: "gate_unsettled", linkIndex: 0 });
    expect(codes(verdict.gaps)).toContain("no_settled_gate");
  });

  it("stops at signal when no gate was ever convened", () => {
    const verdict = traceLineage(chain({ gates: [] }));
    expect(verdict.reachedStage).toBe("signal");
    expect(codes(verdict.gaps)).toContain("no_settled_gate");
  });

  it("counts a refused gate as a decision, because refusing is deciding", () => {
    const verdict = traceLineage(
      chain({
        gates: [{ gate: "approval", outcome: "refused" }],
        initiativeStatus: "rejected",
      }),
    );
    expect(verdict.reachedStage).toBe("memory");
    expect(codes(verdict.gaps)).not.toContain("no_settled_gate");
  });

  it("stops at decision while the initiative is still in flight", () => {
    const verdict = traceLineage(chain({ initiativeStatus: "piloting" }));
    expect(verdict.reachedStage).toBe("decision");
    expect(codes(verdict.gaps)).toContain("initiative_in_flight");
  });

  it("counts a withdrawn initiative as having an outcome", () => {
    const verdict = traceLineage(chain({ initiativeStatus: "withdrawn" }));
    expect(verdict.reachedStage).toBe("memory");
    expect(codes(verdict.gaps)).not.toContain("initiative_in_flight");
  });

  it("treats every terminal status as an outcome and no others", () => {
    for (const status of INITIATIVE_STATUSES) {
      const verdict = traceLineage(chain({ initiativeStatus: status }));
      const reachedOutcome = lineageStageRank(verdict.reachedStage) >= lineageStageRank("outcome");
      expect(reachedOutcome).toBe(isTerminalInitiativeStatus(status));
    }
  });

  it("stops at outcome when the retrospective wrote nothing down", () => {
    const verdict = traceLineage(chain({ lessons: [] }));
    expect(verdict.reachedStage).toBe("outcome");
    expect(codes(verdict.gaps)).toContain("no_lesson");
  });

  it("stops at outcome when a lesson never reached memory, and says which one", () => {
    const verdict = traceLineage(
      chain({ lessons: [{ retention: "retained" }, { retention: "provisional" }] }),
    );
    expect(verdict.traceable).toBe(false);
    expect(verdict.reachedStage).toBe("outcome");
    expect(verdict.gaps).toEqual([{ code: "lesson_provisional", linkIndex: 1 }]);
  });

  it("counts a superseded lesson as having reached memory", () => {
    const verdict = traceLineage(chain({ lessons: [{ retention: "superseded" }] }));
    expect(verdict.reachedStage).toBe("memory");
  });

  it("collects gaps above the break, not only the one that stopped the chain", () => {
    const verdict = traceLineage(
      chain({
        signals: [{ status: "raised", evidenceCited: 0 }],
        gates: [{ gate: "approval", outcome: "pending" }],
        lessons: [{ retention: "provisional" }],
      }),
    );
    expect(verdict.reachedStage).toBe("unrecorded");
    expect(codes(verdict.gaps)).toEqual([
      "signal_without_evidence",
      "gate_unsettled",
      "lesson_provisional",
      "signal_not_taken_up",
      "no_settled_gate",
    ]);
  });

  it("is traceable only at the top of the ladder", () => {
    const chains: LineageChain[] = [
      chain({ signals: [] }),
      chain({ signals: [{ status: "raised", evidenceCited: 1 }] }),
      chain({ gates: [] }),
      chain({ initiativeStatus: "piloting" }),
      chain({ lessons: [] }),
      chain(),
    ];
    for (const candidate of chains) {
      const verdict = traceLineage(candidate);
      expect(verdict.traceable).toBe(verdict.reachedStage === "memory");
    }
  });

  it("reads every signal status without reaching outside the vocabulary", () => {
    for (const status of SIGNAL_STATUSES) {
      const verdict = traceLineage(chain({ signals: [{ status, evidenceCited: 1 }] }));
      expect(LINEAGE_STAGES).toContain(verdict.reachedStage);
    }
  });
});

describe("deliberate absences", () => {
  it("holds no clock: the same chain always reads the same way", () => {
    const subject = chain({ initiativeStatus: "piloting" });
    expect(traceLineage(subject)).toEqual(traceLineage(subject));
  });

  it("mutates nothing it was given", () => {
    const subject = chain();
    const before = JSON.stringify(subject);
    traceLineage(subject);
    expect(JSON.stringify(subject)).toBe(before);
  });

  it("re-inspects no citation, reading only the count the evidence engine left", () => {
    const verdict = traceLineage(chain({ signals: [{ status: "accepted", evidenceCited: 1 }] }));
    expect(verdict.reachedStage).toBe("memory");
    expect(verdict.gaps).toEqual([]);
  });
});
