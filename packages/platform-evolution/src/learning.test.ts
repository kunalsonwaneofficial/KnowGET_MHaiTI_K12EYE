import { describe, expect, it } from "vitest";
import {
  CAPABILITY_AREAS,
  LESSON_RETENTIONS,
  LESSON_REVIEW_PERIODS,
  type LessonRetention,
  MAX_LESSON_APPLICABILITY,
  MAX_LESSON_STATEMENT_LENGTH,
  MIN_LESSON_STATEMENT_LENGTH,
  isCapabilityArea,
  isLessonRetention,
} from "./evolution-value";
import type { LessonDraft, RetentionChangeRequest } from "./evolution-view";
import {
  RETENTION_PROGRESSIONS,
  inspectLesson,
  inspectRetentionChange,
  reviewStanding,
} from "./learning";

const STATEMENT = "Timetable changes land better when heads of year see them a fortnight ahead.";

const draft = (overrides: Partial<LessonDraft> = {}): LessonDraft => ({
  statement: STATEMENT,
  category: "process",
  origin: "cycle_retrospective",
  originRef: "cycle-2026-t2",
  applicability: ["academic_practice"],
  ...overrides,
});

const retention = (overrides: Partial<RetentionChangeRequest> = {}): RetentionChangeRequest => ({
  from: "provisional",
  to: "retained",
  lessonKey: "lesson-timetable-notice",
  commitmentResolved: true,
  supersededBy: null,
  ...overrides,
});

const codes = (issues: readonly { code: string }[]): string[] => issues.map((issue) => issue.code);

describe("inspectLesson", () => {
  it("accepts a lesson with a statement, an origin reference and a recognised area", () => {
    const verdict = inspectLesson(draft());
    expect(verdict.usable).toBe(true);
    expect(verdict.issues).toEqual([]);
    expect(verdict.areas).toEqual(["academic_practice"]);
  });

  it("refuses a blank statement without also calling it too short", () => {
    const verdict = inspectLesson(draft({ statement: "   " }));
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toEqual(["blank_statement"]);
  });

  it("refuses a statement too short to be a lesson", () => {
    const verdict = inspectLesson(draft({ statement: "communicate better" }));
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toContain("statement_too_short");
  });

  it("accepts a statement of exactly the minimum length", () => {
    const verdict = inspectLesson(draft({ statement: "x".repeat(MIN_LESSON_STATEMENT_LENGTH) }));
    expect(verdict.usable).toBe(true);
  });

  it("refuses a statement long enough to be a report", () => {
    const verdict = inspectLesson(
      draft({ statement: "x".repeat(MAX_LESSON_STATEMENT_LENGTH + 1) }),
    );
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toContain("statement_too_long");
  });

  it("measures the statement after trimming, so padding cannot buy length", () => {
    const short = "x".repeat(MIN_LESSON_STATEMENT_LENGTH - 1);
    const verdict = inspectLesson(draft({ statement: `   ${short}   ` }));
    expect(codes(verdict.issues)).toContain("statement_too_short");
  });

  it("refuses a lesson that names no record it came out of", () => {
    const verdict = inspectLesson(draft({ originRef: "  " }));
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toContain("blank_origin_ref");
  });

  it("refuses a lesson that applies to nothing", () => {
    const verdict = inspectLesson(draft({ applicability: [] }));
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toContain("no_applicability");
  });

  it("refuses a lesson that claims to apply almost everywhere", () => {
    const verdict = inspectLesson(
      draft({ applicability: CAPABILITY_AREAS.slice(0, MAX_LESSON_APPLICABILITY + 1) }),
    );
    expect(verdict.usable).toBe(false);
    expect(codes(verdict.issues)).toContain("too_many_areas");
  });

  it("accepts exactly the maximum number of areas", () => {
    const verdict = inspectLesson(
      draft({ applicability: CAPABILITY_AREAS.slice(0, MAX_LESSON_APPLICABILITY) }),
    );
    expect(verdict.usable).toBe(true);
    expect(verdict.areas).toHaveLength(MAX_LESSON_APPLICABILITY);
  });

  it("normalizes areas before recognising them", () => {
    const verdict = inspectLesson(draft({ applicability: ["  Academic_Practice  "] }));
    expect(verdict.usable).toBe(true);
    expect(verdict.areas).toEqual(["academic_practice"]);
  });

  it("drops an unknown area and names where it was, without failing the lesson", () => {
    const verdict = inspectLesson(draft({ applicability: ["academic_practice", "morale"] }));
    expect(verdict.usable).toBe(true);
    expect(verdict.areas).toEqual(["academic_practice"]);
    expect(verdict.issues).toEqual([{ code: "unknown_area", areaIndex: 1 }]);
  });

  it("drops a repeated area and names where it was, without failing the lesson", () => {
    const verdict = inspectLesson(
      draft({ applicability: ["academic_practice", "academic_practice"] }),
    );
    expect(verdict.usable).toBe(true);
    expect(verdict.areas).toEqual(["academic_practice"]);
    expect(verdict.issues).toEqual([{ code: "duplicate_area", areaIndex: 1 }]);
  });

  it("returns the areas that survived even when the lesson itself is unusable", () => {
    const verdict = inspectLesson(draft({ statement: "", applicability: ["staff_capability"] }));
    expect(verdict.usable).toBe(false);
    expect(verdict.areas).toEqual(["staff_capability"]);
  });

  it("counts only surviving areas toward the applicability limits", () => {
    const repeated = Array.from({ length: MAX_LESSON_APPLICABILITY + 3 }, () => "learner_support");
    const verdict = inspectLesson(draft({ applicability: repeated }));
    expect(verdict.areas).toEqual(["learner_support"]);
    expect(codes(verdict.issues)).not.toContain("too_many_areas");
  });

  it("reports every fault at once rather than the first", () => {
    const verdict = inspectLesson(draft({ statement: "", originRef: "", applicability: [] }));
    expect(codes(verdict.issues)).toEqual([
      "blank_statement",
      "blank_origin_ref",
      "no_applicability",
    ]);
  });

  it("returns only recognised areas, whatever was submitted", () => {
    const verdict = inspectLesson(
      draft({ applicability: ["operational_process", "morale", "learner_support"] }),
    );
    for (const area of verdict.areas) {
      expect(isCapabilityArea(area)).toBe(true);
    }
  });
});

describe("RETENTION_PROGRESSIONS", () => {
  it("declares a target list for every retention state", () => {
    for (const state of LESSON_RETENTIONS) {
      expect(Array.isArray(RETENTION_PROGRESSIONS[state])).toBe(true);
    }
  });

  it("never reaches a state outside the vocabulary", () => {
    for (const state of LESSON_RETENTIONS) {
      for (const target of RETENTION_PROGRESSIONS[state]) {
        expect(isLessonRetention(target)).toBe(true);
      }
    }
  });

  it("runs one way only, with no route back to provisional", () => {
    const reachable = new Set(LESSON_RETENTIONS.flatMap((s) => RETENTION_PROGRESSIONS[s]));
    expect(reachable.has("provisional")).toBe(false);
  });

  it("is frozen at both levels", () => {
    expect(Object.isFrozen(RETENTION_PROGRESSIONS)).toBe(true);
    for (const state of LESSON_RETENTIONS) {
      expect(Object.isFrozen(RETENTION_PROGRESSIONS[state])).toBe(true);
    }
    expect(() =>
      (RETENTION_PROGRESSIONS.provisional as LessonRetention[]).push("superseded"),
    ).toThrow(TypeError);
  });
});

describe("inspectRetentionChange", () => {
  it("retains a lesson once its memory commitment has resolved", () => {
    const verdict = inspectRetentionChange(retention());
    expect(verdict.allowed).toBe(true);
    expect(verdict.refusal).toBeNull();
  });

  it("refuses to retain a lesson whose commitment has not resolved", () => {
    const verdict = inspectRetentionChange(retention({ commitmentResolved: false }));
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("commitment_unresolved");
  });

  it("refuses a move to the state the lesson is already in", () => {
    const verdict = inspectRetentionChange(retention({ from: "retained", to: "retained" }));
    expect(verdict.refusal).toBe("same_retention");
  });

  it("refuses any move out of superseded", () => {
    for (const to of LESSON_RETENTIONS) {
      const verdict = inspectRetentionChange(retention({ from: "superseded", to }));
      expect(verdict.allowed).toBe(false);
    }
    expect(inspectRetentionChange(retention({ from: "superseded", to: "retained" })).refusal).toBe(
      "terminal_retention",
    );
  });

  it("supersedes a retained lesson when a replacement is named", () => {
    const verdict = inspectRetentionChange(
      retention({ from: "retained", to: "superseded", supersededBy: "lesson-notice-window" }),
    );
    expect(verdict.allowed).toBe(true);
  });

  it("refuses supersession that names no replacement", () => {
    const verdict = inspectRetentionChange(
      retention({ from: "retained", to: "superseded", supersededBy: null }),
    );
    expect(verdict.refusal).toBe("no_superseding_lesson");
  });

  it("treats a blank replacement as no replacement at all", () => {
    const verdict = inspectRetentionChange(
      retention({ from: "retained", to: "superseded", supersededBy: "   " }),
    );
    expect(verdict.refusal).toBe("no_superseding_lesson");
  });

  it("refuses a lesson recorded as its own replacement", () => {
    const verdict = inspectRetentionChange(
      retention({
        from: "retained",
        to: "superseded",
        lessonKey: "lesson-notice",
        supersededBy: "  Lesson-Notice ",
      }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("self_supersession");
  });

  it("echoes the move it was asked about on every verdict", () => {
    const verdict = inspectRetentionChange(retention({ from: "provisional", to: "superseded" }));
    expect(verdict.from).toBe("provisional");
    expect(verdict.to).toBe("superseded");
  });

  it("allows nothing the progression map does not, across the whole cross-product", () => {
    for (const from of LESSON_RETENTIONS) {
      for (const to of LESSON_RETENTIONS) {
        const verdict = inspectRetentionChange(
          retention({ from, to, commitmentResolved: true, supersededBy: "lesson-other" }),
        );
        expect(verdict.allowed).toBe(RETENTION_PROGRESSIONS[from].includes(to));
      }
    }
  });
});

describe("reviewStanding", () => {
  it("reports nothing due for a lesson that has just entered memory", () => {
    const standing = reviewStanding("retained", 4, 4);
    expect(standing.reviewDue).toBe(false);
    expect(standing.periodsSinceRetention).toBe(0);
    expect(standing.periodsUntilDue).toBe(LESSON_REVIEW_PERIODS);
  });

  it("counts down as periods complete", () => {
    const standing = reviewStanding("retained", 4, 7);
    expect(standing.periodsSinceRetention).toBe(3);
    expect(standing.periodsUntilDue).toBe(LESSON_REVIEW_PERIODS - 3);
    expect(standing.reviewDue).toBe(false);
  });

  it("falls due exactly on the review interval, not a period later", () => {
    const standing = reviewStanding("retained", 0, LESSON_REVIEW_PERIODS);
    expect(standing.reviewDue).toBe(true);
    expect(standing.periodsUntilDue).toBe(0);
  });

  it("stays due, and never goes negative, long after the interval passed", () => {
    const standing = reviewStanding("retained", 0, LESSON_REVIEW_PERIODS * 5);
    expect(standing.reviewDue).toBe(true);
    expect(standing.periodsUntilDue).toBe(0);
  });

  it("never calls a provisional lesson due, because unfinished is not overdue", () => {
    const standing = reviewStanding("provisional", 0, LESSON_REVIEW_PERIODS * 3);
    expect(standing.reviewDue).toBe(false);
    expect(standing.periodsSinceRetention).toBe(0);
  });

  it("never calls a superseded lesson due, because history does not come due", () => {
    const standing = reviewStanding("superseded", 0, LESSON_REVIEW_PERIODS * 3);
    expect(standing.reviewDue).toBe(false);
  });

  it("reports zeros for a retained lesson with no recorded retention period", () => {
    const standing = reviewStanding("retained", null, 40);
    expect(standing.reviewDue).toBe(false);
    expect(standing.periodsSinceRetention).toBe(0);
    expect(standing.periodsUntilDue).toBe(0);
  });

  it("treats an as-of before retention as nothing elapsed rather than a negative count", () => {
    const standing = reviewStanding("retained", 9, 2);
    expect(standing.periodsSinceRetention).toBe(0);
    expect(standing.reviewDue).toBe(false);
  });

  it("refuses to guess from an off-grid period", () => {
    expect(reviewStanding("retained", -1, 40).periodsSinceRetention).toBe(0);
    expect(reviewStanding("retained", 0, Number.NaN).periodsSinceRetention).toBe(0);
  });

  it("echoes the retention it was asked about", () => {
    for (const state of LESSON_RETENTIONS) {
      expect(reviewStanding(state, 1, 2).retention).toBe(state);
    }
  });
});

describe("deliberate absences", () => {
  it("offers no way to retain a lesson except through a resolved commitment", () => {
    for (const resolved of [true, false]) {
      const verdict = inspectRetentionChange(
        retention({ from: "provisional", to: "retained", commitmentResolved: resolved }),
      );
      expect(verdict.allowed).toBe(resolved);
    }
  });

  it("offers no way to supersede a lesson that never reached memory", () => {
    const verdict = inspectRetentionChange(
      retention({ from: "provisional", to: "superseded", supersededBy: "lesson-other" }),
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.refusal).toBe("unreachable_retention");
  });

  it("holds no clock: the same lesson and period always give the same standing", () => {
    const first = reviewStanding("retained", 3, 12);
    const second = reviewStanding("retained", 3, 12);
    expect(first).toEqual(second);
  });

  it("neither demotes nor expires a lesson, only reports that review is due", () => {
    const standing = reviewStanding("retained", 0, LESSON_REVIEW_PERIODS * 10);
    expect(standing.retention).toBe("retained");
    expect(standing.reviewDue).toBe(true);
  });
});
