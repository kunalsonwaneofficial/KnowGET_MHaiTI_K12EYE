import { describe, expect, it } from "vitest";
import {
  CYCLE_PROGRESSIONS,
  elapsedPeriods,
  inspectSpan,
  inspectStageChange,
  requiredCycleGate,
} from "./cadence";
import {
  CYCLE_STAGES,
  type CycleStage,
  GATE_OUTCOMES,
  MAX_PERIOD,
  MIN_LESSONS_FOR_CLOSURE,
  MIN_PERIOD,
  TERMINAL_CYCLE_STAGES,
  isCycleStage,
  isTerminalCycleStage,
} from "./evolution-value";
import type { StageChangeRequest } from "./evolution-view";

const change = (overrides: Partial<StageChangeRequest> = {}): StageChangeRequest => ({
  from: "planning",
  to: "executing",
  gateOutcome: null,
  lessonsRecorded: 0,
  ...overrides,
});

const nonTerminal = CYCLE_STAGES.filter((stage) => !isTerminalCycleStage(stage));

describe("inspectSpan", () => {
  it("counts a span that begins and ends in the same period as one period", () => {
    const verdict = inspectSpan(4, 4);
    expect(verdict.usable).toBe(true);
    expect(verdict.periods).toBe(1);
    expect(verdict.issues).toEqual([]);
  });

  it("counts both ends of a longer span", () => {
    expect(inspectSpan(4, 9).periods).toBe(6);
  });

  it("accepts the first and last legal periods", () => {
    expect(inspectSpan(MIN_PERIOD, MIN_PERIOD).usable).toBe(true);
    expect(inspectSpan(MAX_PERIOD, MAX_PERIOD).usable).toBe(true);
  });

  it("rejects a start below the grid", () => {
    expect(inspectSpan(MIN_PERIOD - 1, 5).issues).toEqual(["invalid_start_period"]);
  });

  it("rejects an end beyond the grid", () => {
    expect(inspectSpan(5, MAX_PERIOD + 1).issues).toEqual(["invalid_end_period"]);
  });

  it("rejects a period that is not a whole number", () => {
    expect(inspectSpan(1.5, 5).issues).toEqual(["invalid_start_period"]);
  });

  it("rejects periods arithmetic cannot be trusted with", () => {
    expect(inspectSpan(Number.NaN, 5).issues).toEqual(["invalid_start_period"]);
    expect(inspectSpan(0, Number.POSITIVE_INFINITY).issues).toEqual(["invalid_end_period"]);
  });

  it("reports both ends when both are wrong", () => {
    expect(inspectSpan(-1, -2).issues).toEqual(["invalid_start_period", "invalid_end_period"]);
  });

  it("reports a span that runs backwards", () => {
    const verdict = inspectSpan(9, 4);
    expect(verdict.usable).toBe(false);
    expect(verdict.issues).toEqual(["end_before_start"]);
  });

  it("does not blame the ordering of two periods it has already rejected", () => {
    expect(inspectSpan(-1, -2).issues).not.toContain("end_before_start");
  });

  it("counts nothing rather than guessing when the span is unusable", () => {
    expect(inspectSpan(9, 4).periods).toBe(0);
    expect(inspectSpan(Number.NaN, 4).periods).toBe(0);
  });

  it("echoes the periods it was given, so an unusable span is still readable", () => {
    const verdict = inspectSpan(9, 4);
    expect(verdict.startPeriod).toBe(9);
    expect(verdict.endPeriod).toBe(4);
  });
});

describe("elapsedPeriods", () => {
  it("counts nothing in the period something started in", () => {
    expect(elapsedPeriods(7, 7)).toBe(0);
  });

  it("counts one once the next period arrives", () => {
    expect(elapsedPeriods(7, 8)).toBe(1);
  });

  it("counts completed periods across a longer run", () => {
    expect(elapsedPeriods(2, 11)).toBe(9);
  });

  it("counts nothing when asked about a period before the start", () => {
    expect(elapsedPeriods(7, 3)).toBe(0);
  });

  it("counts nothing rather than throwing on a period off the grid", () => {
    expect(elapsedPeriods(-1, 5)).toBe(0);
    expect(elapsedPeriods(0, MAX_PERIOD + 1)).toBe(0);
    expect(elapsedPeriods(Number.NaN, 5)).toBe(0);
    expect(elapsedPeriods(1.5, 5)).toBe(0);
  });

  it("works at both ends of the grid", () => {
    expect(elapsedPeriods(MIN_PERIOD, MAX_PERIOD)).toBe(MAX_PERIOD - MIN_PERIOD);
  });
});

describe("CYCLE_PROGRESSIONS", () => {
  it("declares a target list for every stage in the vocabulary", () => {
    for (const stage of CYCLE_STAGES) {
      expect(Array.isArray(CYCLE_PROGRESSIONS[stage])).toBe(true);
    }
  });

  it("never reaches a stage outside the vocabulary", () => {
    for (const stage of CYCLE_STAGES) {
      for (const target of CYCLE_PROGRESSIONS[stage]) {
        expect(isCycleStage(target)).toBe(true);
      }
    }
  });

  it("gives every terminal stage an empty target list and no others", () => {
    for (const stage of CYCLE_STAGES) {
      const terminal = CYCLE_PROGRESSIONS[stage].length === 0;
      expect(terminal).toBe(TERMINAL_CYCLE_STAGES.includes(stage));
    }
  });

  it("lets a cycle be abandoned from every stage it can still be in", () => {
    for (const stage of nonTerminal) {
      expect(CYCLE_PROGRESSIONS[stage]).toContain("abandoned");
    }
  });

  it("reaches closed only from reviewing, so no cycle closes without a review", () => {
    const into = CYCLE_STAGES.filter((stage) => CYCLE_PROGRESSIONS[stage].includes("closed"));
    expect(into).toEqual(["reviewing"]);
  });

  it("offers no route back into planning", () => {
    const reachable = new Set(CYCLE_STAGES.flatMap((stage) => CYCLE_PROGRESSIONS[stage]));
    expect(reachable.has("planning")).toBe(false);
  });

  it("is frozen at both levels, so the review step cannot be removed at runtime", () => {
    expect(Object.isFrozen(CYCLE_PROGRESSIONS)).toBe(true);
    for (const stage of CYCLE_STAGES) {
      expect(Object.isFrozen(CYCLE_PROGRESSIONS[stage])).toBe(true);
    }
    expect(() => (CYCLE_PROGRESSIONS.executing as CycleStage[]).push("closed")).toThrow(TypeError);
  });
});

describe("requiredCycleGate", () => {
  it("puts the closure gate in front of closed", () => {
    expect(requiredCycleGate("reviewing", "closed")).toBe("cycle_closure");
  });

  it("gates exactly one move out of the whole cross-product", () => {
    const gated: string[] = [];
    for (const from of CYCLE_STAGES) {
      for (const to of CYCLE_STAGES) {
        if (requiredCycleGate(from, to) !== null) gated.push(`${from}->${to}`);
      }
    }
    expect(gated).toEqual(["reviewing->closed"]);
  });

  it("asks nobody's permission to admit a cycle stopped", () => {
    for (const from of nonTerminal) {
      expect(requiredCycleGate(from, "abandoned")).toBeNull();
    }
  });
});

describe("inspectStageChange", () => {
  it("allows an ordinary ungated step", () => {
    const verdict = inspectStageChange(change());
    expect(verdict.allowed).toBe(true);
    expect(verdict.gate).toBeNull();
    expect(verdict.refusal).toBeNull();
  });

  it("refuses a move to the stage the cycle is already in", () => {
    expect(inspectStageChange(change({ from: "planning", to: "planning" })).refusal).toBe(
      "same_stage",
    );
  });

  it("refuses any move out of a finished cycle", () => {
    for (const from of TERMINAL_CYCLE_STAGES) {
      const verdict = inspectStageChange(change({ from, to: "executing" }));
      expect(verdict.allowed).toBe(false);
      expect(verdict.refusal).toBe("terminal_stage");
    }
  });

  it("refuses a move that skips the stages in between", () => {
    expect(inspectStageChange(change({ from: "planning", to: "reviewing" })).refusal).toBe(
      "unreachable_stage",
    );
    expect(inspectStageChange(change({ from: "executing", to: "closed" })).refusal).toBe(
      "unreachable_stage",
    );
  });

  it("refuses to close a cycle that wrote nothing down", () => {
    const verdict = inspectStageChange(
      change({
        from: "reviewing",
        to: "closed",
        gateOutcome: "satisfied",
        lessonsRecorded: MIN_LESSONS_FOR_CLOSURE - 1,
      }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("no_lessons");
  });

  it("closes a cycle once it has lessons and a satisfied gate", () => {
    const verdict = inspectStageChange(
      change({
        from: "reviewing",
        to: "closed",
        gateOutcome: "satisfied",
        lessonsRecorded: MIN_LESSONS_FOR_CLOSURE,
      }),
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.gate).toBe("cycle_closure");
  });

  it("names the missing lessons before the missing gate, because they come first", () => {
    const verdict = inspectStageChange(
      change({ from: "reviewing", to: "closed", gateOutcome: null, lessonsRecorded: 0 }),
    );
    expect(verdict.refusal).toBe("no_lessons");
  });

  it("distinguishes a gate nobody convened from one that has not finished", () => {
    const base = { from: "reviewing", to: "closed", lessonsRecorded: 1 } as const;
    expect(inspectStageChange(change({ ...base, gateOutcome: null })).refusal).toBe("gate_missing");
    expect(inspectStageChange(change({ ...base, gateOutcome: "pending" })).refusal).toBe(
      "gate_pending",
    );
  });

  it("distinguishes a refused closure, which leaves the cycle open in review", () => {
    const verdict = inspectStageChange(
      change({ from: "reviewing", to: "closed", gateOutcome: "refused", lessonsRecorded: 1 }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("gate_refused");
  });

  it("reports the gate a refused closure was standing on", () => {
    for (const outcome of GATE_OUTCOMES) {
      const verdict = inspectStageChange(
        change({ from: "reviewing", to: "closed", gateOutcome: outcome, lessonsRecorded: 1 }),
      );
      expect(verdict.gate).toBe("cycle_closure");
    }
  });

  it("ignores the lesson count on moves that are not closure", () => {
    expect(inspectStageChange(change({ from: "executing", to: "reviewing" })).allowed).toBe(true);
  });

  it("ignores a gate outcome on moves that need no gate", () => {
    const verdict = inspectStageChange(
      change({ from: "planning", to: "executing", gateOutcome: "refused" }),
    );
    expect(verdict.allowed).toBe(true);
    expect(verdict.gate).toBeNull();
  });

  it("lets a cycle be abandoned from anywhere without a gate or a lesson", () => {
    for (const from of nonTerminal) {
      const verdict = inspectStageChange(change({ from, to: "abandoned" }));
      expect(verdict.allowed).toBe(true);
      expect(verdict.gate).toBeNull();
    }
  });

  it("echoes the move it was asked about on every verdict", () => {
    const verdict = inspectStageChange(change({ from: "planning", to: "closed" }));
    expect(verdict.from).toBe("planning");
    expect(verdict.to).toBe("closed");
  });

  it("allows nothing the progression map does not, across the whole cross-product", () => {
    for (const from of CYCLE_STAGES) {
      for (const to of CYCLE_STAGES) {
        const verdict = inspectStageChange(
          change({ from, to, gateOutcome: "satisfied", lessonsRecorded: MIN_LESSONS_FOR_CLOSURE }),
        );
        expect(verdict.allowed).toBe(CYCLE_PROGRESSIONS[from].includes(to));
      }
    }
  });
});

describe("deliberate absences", () => {
  it("offers no way to reopen a cycle once it has ended either way", () => {
    for (const from of TERMINAL_CYCLE_STAGES) {
      expect(CYCLE_PROGRESSIONS[from]).toEqual([]);
      for (const to of CYCLE_STAGES) {
        expect(inspectStageChange(change({ from, to })).allowed).toBe(false);
      }
    }
  });

  it("holds no clock — the same span and the same as-of always answer the same", () => {
    expect(inspectSpan(3, 8)).toEqual(inspectSpan(3, 8));
    expect(elapsedPeriods(3, 8)).toBe(elapsedPeriods(3, 8));
  });
});
