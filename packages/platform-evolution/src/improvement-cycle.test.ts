import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  CycleAlreadyInStageError,
  CycleClosureGateNotConvenedError,
  CycleClosureGatePendingError,
  CycleClosureGateRefusedError,
  CycleIntentFrozenError,
  CycleIntentLengthError,
  CycleSettledError,
  CycleSpanFixedError,
  CycleWithoutLessonsError,
  EmptyAbandonmentReasonError,
  EmptyCycleKeyError,
  InvalidCycleKeyError,
  InvalidCycleProgressionError,
  UnusableCycleSpanError,
} from "./errors";
import {
  CYCLE_STAGES,
  MAX_PERIOD,
  MAX_SUMMARY_LENGTH,
  MIN_LESSONS_FOR_CLOSURE,
  MIN_SUMMARY_LENGTH,
} from "./evolution-value";
import {
  type ImprovementCycle,
  type OpenCycleParams,
  abandonCycle,
  closeCycle,
  cycleElapsedPeriods,
  cycleSpan,
  isCycleClosed,
  isCycleOpen,
  isCycleSettled,
  openCycle,
  rescheduleCycle,
  reviseCycleIntent,
  startCycleExecution,
  startCycleReview,
} from "./improvement-cycle";
import * as cycleModule from "./improvement-cycle";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const OPENER = "person-1" as Uuid;
const ACTOR = "person-9" as Uuid;

const INTENT =
  "Cut the gap between a marking concern being raised and something changing about it.";

/** The period the fixture rounds run from, and the period they run to. Four periods, both ends counted. */
const START = 4;
const END = 7;

const opening = (overrides: Partial<OpenCycleParams> = {}): OpenCycleParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  cycleKey: "academic.autumn-improvement",
  intent: INTENT,
  startPeriod: START,
  endPeriod: END,
  openedBy: OPENER,
  ...overrides,
});

const planning = (overrides: Partial<OpenCycleParams> = {}): ImprovementCycle =>
  openCycle(opening(overrides));

const executing = (overrides: Partial<OpenCycleParams> = {}): ImprovementCycle =>
  startCycleExecution(planning(overrides));

const reviewing = (overrides: Partial<OpenCycleParams> = {}): ImprovementCycle =>
  startCycleReview(executing(overrides));

const closed = (overrides: Partial<OpenCycleParams> = {}): ImprovementCycle =>
  closeCycle(reviewing(overrides), "satisfied", 3, ACTOR);

const abandoned = (overrides: Partial<OpenCycleParams> = {}): ImprovementCycle =>
  abandonCycle(executing(overrides), ACTOR, "The head of department left mid-term.");

describe("openCycle", () => {
  it("normalizes the key so one round is quoted the same way everywhere", () => {
    expect(planning({ cycleKey: "  Academic.Autumn-Improvement  " }).cycleKey).toBe(
      "academic.autumn-improvement",
    );
  });

  it("refuses a key that is nothing but space", () => {
    expect(() => planning({ cycleKey: "   " })).toThrow(EmptyCycleKeyError);
  });

  it("refuses a key the vocabulary would not recognise", () => {
    expect(() => planning({ cycleKey: "academic..autumn" })).toThrow(InvalidCycleKeyError);
  });

  it("refuses an intent too short for review to judge anything against", () => {
    let thrown: CycleIntentLengthError | null = null;
    try {
      planning({ intent: "x".repeat(MIN_SUMMARY_LENGTH - 1) });
    } catch (error) {
      thrown = error as CycleIntentLengthError;
    }
    expect(thrown).toBeInstanceOf(CycleIntentLengthError);
    expect(thrown?.details).toMatchObject({
      length: MIN_SUMMARY_LENGTH - 1,
      minimum: MIN_SUMMARY_LENGTH,
      maximum: MAX_SUMMARY_LENGTH,
    });
  });

  it("refuses an intent long enough to be a plan in disguise", () => {
    expect(() => planning({ intent: "x".repeat(MAX_SUMMARY_LENGTH + 1) })).toThrow(
      CycleIntentLengthError,
    );
  });

  it("accepts an intent sitting exactly on either bound", () => {
    expect(planning({ intent: "x".repeat(MIN_SUMMARY_LENGTH) }).intent).toHaveLength(
      MIN_SUMMARY_LENGTH,
    );
    expect(planning({ intent: "x".repeat(MAX_SUMMARY_LENGTH) }).intent).toHaveLength(
      MAX_SUMMARY_LENGTH,
    );
  });

  it("measures the intent after trimming it, not before", () => {
    expect(planning({ intent: `   ${INTENT}   ` }).intent).toBe(INTENT);
  });

  it("refuses a round that finishes before it starts", () => {
    let thrown: UnusableCycleSpanError | null = null;
    try {
      planning({ startPeriod: END, endPeriod: START });
    } catch (error) {
      thrown = error as UnusableCycleSpanError;
    }
    expect(thrown).toBeInstanceOf(UnusableCycleSpanError);
    expect(thrown?.details).toMatchObject({
      cycleKey: "academic.autumn-improvement",
      issues: ["end_before_start"],
    });
  });

  it("refuses a boundary off the grid the caller declared", () => {
    let thrown: UnusableCycleSpanError | null = null;
    try {
      planning({ endPeriod: MAX_PERIOD + 1 });
    } catch (error) {
      thrown = error as UnusableCycleSpanError;
    }
    expect(thrown).toBeInstanceOf(UnusableCycleSpanError);
    expect((thrown?.details as { issues: readonly string[] }).issues).toContain(
      "invalid_end_period",
    );
  });

  it("counts both ends of the round, so a single-period round is one period and not zero", () => {
    expect(planning().periods).toBe(END - START + 1);
    expect(planning({ startPeriod: START, endPeriod: START }).periods).toBe(1);
  });

  it("starts in planning, with no lessons, no stamps and no ending", () => {
    const cycle = planning();
    expect(cycle.stage).toBe("planning");
    expect(cycle.openedBy).toBe(OPENER);
    expect(cycle.lessonsRecorded).toBe(0);
    expect(cycle.executionStartedAt).toBeNull();
    expect(cycle.reviewStartedAt).toBeNull();
    expect(cycle.settledAt).toBeNull();
    expect(cycle.settledBy).toBeNull();
    expect(cycle.abandonmentReason).toBeNull();
  });
});

describe("the forward path", () => {
  it("carries a round from planning to closure one stage at a time", () => {
    expect(planning().stage).toBe("planning");
    expect(executing().stage).toBe("executing");
    expect(reviewing().stage).toBe("reviewing");
    expect(closed().stage).toBe("closed");
  });

  it("stamps each crossing as it happens and leaves the ones ahead of it unset", () => {
    expect(executing().executionStartedAt).not.toBeNull();
    expect(executing().reviewStartedAt).toBeNull();
    expect(reviewing().reviewStartedAt).not.toBeNull();
    expect(reviewing().settledAt).toBeNull();
    expect(closed().settledAt).not.toBeNull();
    expect(closed().settledBy).toBe(ACTOR);
  });

  it("refuses to start reviewing work that never started", () => {
    expect(() => startCycleReview(planning())).toThrow(InvalidCycleProgressionError);
  });

  it("refuses to close a round that was never reviewed", () => {
    expect(() => closeCycle(executing(), "satisfied", 3, ACTOR)).toThrow(
      InvalidCycleProgressionError,
    );
  });

  it("refuses to go backwards from review into execution", () => {
    let thrown: InvalidCycleProgressionError | null = null;
    try {
      startCycleExecution(reviewing());
    } catch (error) {
      thrown = error as InvalidCycleProgressionError;
    }
    expect(thrown).toBeInstanceOf(InvalidCycleProgressionError);
    expect(thrown?.details).toMatchObject({ from: "reviewing", to: "executing" });
  });

  it("refuses to re-enter the stage it is already in", () => {
    let thrown: CycleAlreadyInStageError | null = null;
    try {
      startCycleExecution(executing());
    } catch (error) {
      thrown = error as CycleAlreadyInStageError;
    }
    expect(thrown).toBeInstanceOf(CycleAlreadyInStageError);
    expect(thrown?.details).toMatchObject({ stage: "executing" });
  });

  it("refuses every move once the round has an ending", () => {
    expect(() => startCycleReview(closed())).toThrow(CycleSettledError);
    expect(() => startCycleExecution(abandoned())).toThrow(CycleSettledError);
  });
});

describe("closeCycle", () => {
  it("refuses a round that concluded nothing, whatever its gate says", () => {
    let thrown: CycleWithoutLessonsError | null = null;
    try {
      closeCycle(reviewing(), "satisfied", 0, ACTOR);
    } catch (error) {
      thrown = error as CycleWithoutLessonsError;
    }
    expect(thrown).toBeInstanceOf(CycleWithoutLessonsError);
    expect(thrown?.details).toMatchObject({
      lessonsRecorded: 0,
      required: MIN_LESSONS_FOR_CLOSURE,
    });
  });

  it("closes on exactly the lesson floor", () => {
    expect(closeCycle(reviewing(), "satisfied", MIN_LESSONS_FOR_CLOSURE, ACTOR).stage).toBe(
      "closed",
    );
  });

  it("sends the caller to write lessons before it sends them to convene a gate", () => {
    expect(() => closeCycle(reviewing(), null, 0, ACTOR)).toThrow(CycleWithoutLessonsError);
  });

  it("refuses a closure nobody was asked to agree to", () => {
    let thrown: CycleClosureGateNotConvenedError | null = null;
    try {
      closeCycle(reviewing(), null, 3, ACTOR);
    } catch (error) {
      thrown = error as CycleClosureGateNotConvenedError;
    }
    expect(thrown).toBeInstanceOf(CycleClosureGateNotConvenedError);
    expect(thrown?.details).toMatchObject({ gate: "cycle_closure" });
  });

  it("refuses a closure whose gate nobody has answered yet", () => {
    expect(() => closeCycle(reviewing(), "pending", 3, ACTOR)).toThrow(
      CycleClosureGatePendingError,
    );
  });

  it("refuses a closure somebody said no to", () => {
    expect(() => closeCycle(reviewing(), "refused", 3, ACTOR)).toThrow(
      CycleClosureGateRefusedError,
    );
  });

  it("writes the lesson count it was handed rather than one it kept", () => {
    expect(closeCycle(reviewing(), "satisfied", 5, ACTOR).lessonsRecorded).toBe(5);
    expect(reviewing().lessonsRecorded).toBe(0);
  });

  it("records who executed the ending and leaves the reason empty", () => {
    const cycle = closed();
    expect(cycle.settledBy).toBe(ACTOR);
    expect(cycle.abandonmentReason).toBeNull();
  });
});

describe("abandonCycle", () => {
  it("is available from every stage before an ending, and needs no gate", () => {
    expect(abandonCycle(planning(), ACTOR, "Priorities moved.").stage).toBe("abandoned");
    expect(abandonCycle(executing(), ACTOR, "Priorities moved.").stage).toBe("abandoned");
    expect(abandonCycle(reviewing(), ACTOR, "Priorities moved.").stage).toBe("abandoned");
  });

  it("needs no lessons either: an abandonment claims nothing was concluded", () => {
    expect(abandonCycle(executing(), ACTOR, "Priorities moved.").lessonsRecorded).toBe(0);
  });

  it("refuses an abandonment that does not say why", () => {
    expect(() => abandonCycle(executing(), ACTOR, "   ")).toThrow(EmptyAbandonmentReasonError);
  });

  it("records the reason, trimmed", () => {
    expect(abandonCycle(executing(), ACTOR, "  Priorities moved.  ").abandonmentReason).toBe(
      "Priorities moved.",
    );
  });

  it("refuses to bury a round that already has an ending", () => {
    expect(() => abandonCycle(closed(), ACTOR, "Priorities moved.")).toThrow(CycleSettledError);
  });
});

describe("reviseCycleIntent", () => {
  const REVISED = "Cut the gap between a concern being raised and a change reaching the classroom.";

  it("rewrites what the round is for while it is being planned and while it runs", () => {
    expect(reviseCycleIntent(planning(), REVISED).intent).toBe(REVISED);
    expect(reviseCycleIntent(executing(), REVISED).intent).toBe(REVISED);
  });

  it("freezes the intent once review begins, so review judges what the round set out to do", () => {
    let thrown: CycleIntentFrozenError | null = null;
    try {
      reviseCycleIntent(reviewing(), REVISED);
    } catch (error) {
      thrown = error as CycleIntentFrozenError;
    }
    expect(thrown).toBeInstanceOf(CycleIntentFrozenError);
    expect(thrown?.details).toMatchObject({ stage: "reviewing" });
  });

  it("refuses to rewrite a round that already ended", () => {
    expect(() => reviseCycleIntent(closed(), REVISED)).toThrow(CycleSettledError);
  });

  it("holds a revision to the same bounds the opening was held to", () => {
    expect(() => reviseCycleIntent(planning(), "too short")).toThrow(CycleIntentLengthError);
  });
});

describe("rescheduleCycle", () => {
  it("moves the boundaries while the round is still a plan", () => {
    const moved = rescheduleCycle(planning(), START, END + 2);
    expect(moved.endPeriod).toBe(END + 2);
    expect(moved.periods).toBe(END + 2 - START + 1);
  });

  it("fixes the span the moment the work starts", () => {
    let thrown: CycleSpanFixedError | null = null;
    try {
      rescheduleCycle(executing(), START, END + 2);
    } catch (error) {
      thrown = error as CycleSpanFixedError;
    }
    expect(thrown).toBeInstanceOf(CycleSpanFixedError);
    expect(thrown?.details).toMatchObject({ stage: "executing" });
  });

  it("refuses a new span that runs backwards", () => {
    expect(() => rescheduleCycle(planning(), END, START)).toThrow(UnusableCycleSpanError);
  });

  it("refuses to reschedule a round that already ended", () => {
    expect(() => rescheduleCycle(closed(), START, END)).toThrow(CycleSettledError);
  });
});

describe("reading a cycle", () => {
  it("counts a round as open until it reaches one of its two endings", () => {
    expect(isCycleOpen(planning())).toBe(true);
    expect(isCycleOpen(reviewing())).toBe(true);
    expect(isCycleOpen(closed())).toBe(false);
    expect(isCycleOpen(abandoned())).toBe(false);
  });

  it("counts both endings as settled and only one of them as closed", () => {
    expect(isCycleSettled(closed())).toBe(true);
    expect(isCycleSettled(abandoned())).toBe(true);
    expect(isCycleClosed(closed())).toBe(true);
    expect(isCycleClosed(abandoned())).toBe(false);
  });

  it("re-derives the span from the stored boundaries and gets the stored count back", () => {
    const cycle = planning();
    const span = cycleSpan(cycle);
    expect(span.usable).toBe(true);
    expect(span.periods).toBe(cycle.periods);
  });

  it("counts whole periods elapsed and never counts backwards", () => {
    const cycle = planning();
    expect(cycleElapsedPeriods(cycle, START)).toBe(0);
    expect(cycleElapsedPeriods(cycle, START + 2)).toBe(2);
    expect(cycleElapsedPeriods(cycle, START - 3)).toBe(0);
  });
});

describe("deliberate absences", () => {
  it("publishes exactly the surface a cycle has and nothing more", () => {
    expect(Object.keys(cycleModule).sort()).toEqual([
      "abandonCycle",
      "closeCycle",
      "cycleElapsedPeriods",
      "cycleSpan",
      "isCycleClosed",
      "isCycleOpen",
      "isCycleSettled",
      "openCycle",
      "rescheduleCycle",
      "reviseCycleIntent",
      "startCycleExecution",
      "startCycleReview",
    ]);
  });

  it("offers nothing that would carry out the work the round describes", () => {
    const names = Object.keys(cycleModule).join(" ").toLowerCase();
    for (const forbidden of ["deploy", "enact", "rollout", "release", "notify"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("offers no way back into a round that ended: a new round is a new record", () => {
    const names = Object.keys(cycleModule).join(" ").toLowerCase();
    for (const forbidden of ["reopen", "restore", "delete", "unclose", "resume"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("counts no lessons of its own: the closing count is the only one it holds", () => {
    const names = Object.keys(cycleModule).join(" ").toLowerCase();
    for (const forbidden of ["recordlesson", "addlesson", "attachlesson"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("mutates nothing it was given", () => {
    const cycle = reviewing();
    const before = JSON.stringify(cycle);
    closeCycle(cycle, "satisfied", 3, ACTOR);
    abandonCycle(cycle, ACTOR, "Priorities moved.");
    expect(JSON.stringify(cycle)).toBe(before);
  });

  it("moves the updated stamp on every transition and never the created one", () => {
    const cycle = planning();
    const moved = startCycleExecution(cycle);
    expect(moved.createdAt).toBe(cycle.createdAt);
    expect(moved.id).toBe(cycle.id);
    expect(moved.cycleKey).toBe(cycle.cycleKey);
  });

  it("holds no stage outside the five the vocabulary declares", () => {
    const stages = [
      planning().stage,
      executing().stage,
      reviewing().stage,
      closed().stage,
      abandoned().stage,
    ];
    for (const stage of stages) expect(CYCLE_STAGES).toContain(stage);
    expect(new Set(stages).size).toBe(CYCLE_STAGES.length);
  });
});
