import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  EmptyLessonKeyError,
  InvalidLessonKeyError,
  InvalidRetentionPeriodError,
  InvalidRetentionProgressionError,
  LessonAlreadyInRetentionError,
  LessonRetentionSettledError,
  LessonSupersedesItselfError,
  LessonTextFrozenError,
  MemoryCommitmentUnresolvedError,
  NoSupersedingLessonError,
  UnusableLessonError,
} from "./errors";
import {
  CAPABILITY_AREAS,
  INITIAL_LESSON_RETENTION,
  LESSON_REVIEW_PERIODS,
  MAX_LESSON_APPLICABILITY,
  MAX_LESSON_STATEMENT_LENGTH,
  MIN_LESSON_STATEMENT_LENGTH,
} from "./evolution-value";
import {
  type Lesson,
  type RecordLessonParams,
  isLessonProvisional,
  isLessonRetained,
  isLessonSuperseded,
  lessonReviewStanding,
  recordLesson,
  retainLesson,
  reviseLesson,
  supersedeLesson,
} from "./lesson";
import * as lessonModule from "./lesson";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const AUTHOR = "person-1" as Uuid;

const KEY = "academic.marking-turnaround";
const SUCCESSOR = "academic.marking-window";
const STATEMENT =
  "Marking turnaround slips whenever a moderation window overlaps a reporting deadline.";

const draft = (overrides: Partial<RecordLessonParams> = {}): RecordLessonParams => ({
  tenantId: TENANT,
  organizationId: ORG,
  lessonKey: KEY,
  statement: STATEMENT,
  category: "process",
  origin: "cycle_retrospective",
  originRef: "cycle-2026-t1",
  applicability: ["academic_practice"],
  recordedBy: AUTHOR,
  ...overrides,
});

const recorded = (overrides: Partial<RecordLessonParams> = {}): Lesson =>
  recordLesson(draft(overrides));

/** The only route into memory, so every retained fixture goes through a commitment that resolved. */
const retained = (atPeriod = 4): Lesson => retainLesson(recorded(), true, atPeriod);

const superseded = (): Lesson => supersedeLesson(retained(), SUCCESSOR);

describe("recordLesson", () => {
  it("writes down what the institution concluded", () => {
    const lesson = recorded();
    expect(lesson).toMatchObject({
      tenantId: TENANT,
      organizationId: ORG,
      lessonKey: KEY,
      statement: STATEMENT,
      category: "process",
      origin: "cycle_retrospective",
      originRef: "cycle-2026-t1",
      areas: ["academic_practice"],
      recordedBy: AUTHOR,
    });
    expect(lesson.id).toEqual(expect.any(String));
    expect(lesson.createdAt).toBe(lesson.updatedAt);
  });

  it("starts every lesson provisional, with no parameter that skips it", () => {
    expect(recorded().retention).toBe(INITIAL_LESSON_RETENTION);
    expect(recorded().retention).toBe("provisional");
    expect(Object.keys(draft())).not.toContain("retention");
  });

  it("leaves every memory tracker empty, because nothing has happened to the lesson yet", () => {
    expect(recorded()).toMatchObject({
      retainedAtPeriod: null,
      retainedAt: null,
      supersededAt: null,
      supersedingLessonKey: null,
    });
  });

  it("canonicalises the key, so one conclusion answers to one address", () => {
    expect(recorded({ lessonKey: `  ${KEY.toUpperCase()}  ` }).lessonKey).toBe(KEY);
  });

  it("refuses a lesson nothing can address", () => {
    expect(() => recorded({ lessonKey: "   " })).toThrow(EmptyLessonKeyError);
  });

  it("refuses a key no lineage trace will match again", () => {
    expect(() => recorded({ lessonKey: "academic..turnaround" })).toThrow(InvalidLessonKeyError);
    expect(() => recorded({ lessonKey: "ab" })).toThrow(InvalidLessonKeyError);
    expect(() => recorded({ lessonKey: "academic marking" })).toThrow(InvalidLessonKeyError);
  });

  it("trims the statement and the origin reference it stores", () => {
    const lesson = recorded({ statement: `  ${STATEMENT}  `, originRef: "  cycle-2026-t1  " });
    expect(lesson.statement).toBe(STATEMENT);
    expect(lesson.originRef).toBe("cycle-2026-t1");
  });

  it("refuses a statement too short to be findable and one long enough to be a report", () => {
    expect(() => recorded({ statement: "a".repeat(MIN_LESSON_STATEMENT_LENGTH - 1) })).toThrow(
      UnusableLessonError,
    );
    expect(() => recorded({ statement: "a".repeat(MAX_LESSON_STATEMENT_LENGTH + 1) })).toThrow(
      UnusableLessonError,
    );
    expect(recorded({ statement: "a".repeat(MIN_LESSON_STATEMENT_LENGTH) }).statement).toHaveLength(
      MIN_LESSON_STATEMENT_LENGTH,
    );
  });

  it("refuses a lesson with no origin reference, which is a conclusion with nothing behind it", () => {
    expect(() => recorded({ originRef: "   " })).toThrow(UnusableLessonError);
  });

  it("refuses a lesson that claims to apply everywhere, and one that applies nowhere", () => {
    expect(() => recorded({ applicability: [] })).toThrow(UnusableLessonError);
    expect(() =>
      recorded({ applicability: CAPABILITY_AREAS.slice(0, MAX_LESSON_APPLICABILITY + 1) }),
    ).toThrow(UnusableLessonError);
  });

  it("names every problem with a draft at once rather than one correction at a time", () => {
    let thrown: unknown;
    try {
      recorded({ statement: "too short", applicability: [] });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnusableLessonError);
    expect((thrown as UnusableLessonError).details).toEqual({
      lessonKey: KEY,
      issues: ["statement_too_short", "no_applicability"],
    });
    expect((thrown as UnusableLessonError).httpStatus).toBe(422);
  });

  it("drops an unknown or repeated area rather than losing the lesson over it", () => {
    const lesson = recorded({
      applicability: ["academic_practice", "ACADEMIC_PRACTICE", "not_an_area", "staff_capability"],
    });
    expect(lesson.areas).toEqual(["academic_practice", "staff_capability"]);
  });

  it("accepts a lesson drawn by an automated review step, which concludes nothing on its own", () => {
    const lesson = recorded({ recordedBy: null });
    expect(lesson.recordedBy).toBeNull();
    expect(lesson.retention).toBe("provisional");
  });
});

describe("reviseLesson", () => {
  it("restates the lesson and re-resolves what it speaks to, in one move", () => {
    const revised = reviseLesson(recorded(), `${STATEMENT} It is worst in the summer term.`, [
      "staff_capability",
      "operational_process",
    ]);
    expect(revised.statement).toBe(`${STATEMENT} It is worst in the summer term.`);
    expect(revised.areas).toEqual(["staff_capability", "operational_process"]);
  });

  it("keeps the key, the category and the origin, because those are what make it citable", () => {
    const lesson = recorded();
    const revised = reviseLesson(lesson, `${STATEMENT} Confirmed in two further cycles.`, [
      "academic_practice",
    ]);
    expect(revised).toMatchObject({
      id: lesson.id,
      lessonKey: lesson.lessonKey,
      category: lesson.category,
      origin: lesson.origin,
      originRef: lesson.originRef,
      retention: "provisional",
      createdAt: lesson.createdAt,
    });
  });

  it("holds a revision to the standard the first draft was held to", () => {
    expect(() => reviseLesson(recorded(), "shorter", ["academic_practice"])).toThrow(
      UnusableLessonError,
    );
  });

  it("freezes the statement once the lesson has reached memory", () => {
    let thrown: unknown;
    try {
      reviseLesson(retained(), `${STATEMENT} Reworded after the fact.`, ["academic_practice"]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(LessonTextFrozenError);
    expect((thrown as LessonTextFrozenError).details).toMatchObject({ retention: "retained" });
    expect((thrown as LessonTextFrozenError).httpStatus).toBe(409);
  });

  it("keeps a superseded lesson readable exactly as it was", () => {
    const settled = superseded();
    expect(() =>
      reviseLesson(settled, `${STATEMENT} Rewritten later.`, ["academic_practice"]),
    ).toThrow(LessonTextFrozenError);
    expect(settled.statement).toBe(STATEMENT);
  });
});

describe("retaining", () => {
  it("moves the lesson into memory on the strength of a commitment that resolved", () => {
    const lesson = retainLesson(recorded(), true, 6);
    expect(lesson.retention).toBe("retained");
    expect(lesson.retainedAtPeriod).toBe(6);
    expect(lesson.retainedAt).toEqual(expect.any(String));
  });

  it("refuses a lesson nobody committed anywhere, which is the ordinary end of a retrospective", () => {
    let thrown: unknown;
    try {
      retainLesson(recorded(), false, 6);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MemoryCommitmentUnresolvedError);
    expect((thrown as MemoryCommitmentUnresolvedError).httpStatus).toBe(409);
  });

  it("takes the commitment as an answer rather than working one out", () => {
    const wellFormed = recorded();
    expect(() => retainLesson(wellFormed, false, 6)).toThrow(MemoryCommitmentUnresolvedError);
    expect(retainLesson(wellFormed, true, 6).retention).toBe("retained");
  });

  it("rejects the period before the move, so a malformed request is not reported as a refused one", () => {
    expect(() => retainLesson(recorded(), false, -1)).toThrow(InvalidRetentionPeriodError);
    expect(() => retainLesson(recorded(), true, 1.5)).toThrow(InvalidRetentionPeriodError);
    expect(() => retainLesson(superseded(), true, -1)).toThrow(InvalidRetentionPeriodError);
  });

  it("treats a resubmitted retention as the move already made", () => {
    expect(() => retainLesson(retained(), true, 9)).toThrow(LessonAlreadyInRetentionError);
  });

  it("offers no route back into memory from a conclusion the institution moved past", () => {
    expect(() => retainLesson(superseded(), true, 9)).toThrow(LessonRetentionSettledError);
  });
});

describe("superseding", () => {
  it("records that a later conclusion replaced this one, and leaves this one readable", () => {
    const lesson = superseded();
    expect(lesson).toMatchObject({
      retention: "superseded",
      supersedingLessonKey: SUCCESSOR,
      statement: STATEMENT,
    });
    expect(lesson.supersededAt).toEqual(expect.any(String));
    expect(lesson.retainedAtPeriod).toBe(4);
  });

  it("canonicalises the successor key, because supersession is matched by exact equality", () => {
    expect(supersedeLesson(retained(), `  ${SUCCESSOR.toUpperCase()}  `).supersedingLessonKey).toBe(
      SUCCESSOR,
    );
  });

  it("refuses a supersession with nothing named, which is a lesson being quietly withdrawn", () => {
    let thrown: unknown;
    try {
      supersedeLesson(retained(), "   ");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(NoSupersedingLessonError);
    expect((thrown as NoSupersedingLessonError).httpStatus).toBe(422);
  });

  it("refuses a lesson recorded as its own replacement, however it was cased", () => {
    expect(() => supersedeLesson(retained(), KEY)).toThrow(LessonSupersedesItselfError);
    expect(() => supersedeLesson(retained(), `  ${KEY.toUpperCase()}  `)).toThrow(
      LessonSupersedesItselfError,
    );
  });

  it("refuses to supersede a lesson that never reached memory: that is abandonment", () => {
    let thrown: unknown;
    try {
      supersedeLesson(recorded(), SUCCESSOR);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidRetentionProgressionError);
    expect((thrown as InvalidRetentionProgressionError).details).toMatchObject({
      from: "provisional",
      to: "superseded",
    });
  });

  it("treats a second supersession as the move already made", () => {
    expect(() => supersedeLesson(superseded(), "academic.moderation-window")).toThrow(
      LessonAlreadyInRetentionError,
    );
  });
});

describe("reading", () => {
  it("tells the three retention states apart", () => {
    expect(isLessonProvisional(recorded())).toBe(true);
    expect(isLessonRetained(recorded())).toBe(false);
    expect(isLessonRetained(retained())).toBe(true);
    expect(isLessonSuperseded(retained())).toBe(false);
    expect(isLessonSuperseded(superseded())).toBe(true);
    expect(isLessonProvisional(superseded())).toBe(false);
  });

  it("counts a retained lesson towards review without ever making it due early", () => {
    const lesson = retained(4);
    expect(lessonReviewStanding(lesson, 4)).toEqual({
      retention: "retained",
      reviewDue: false,
      periodsSinceRetention: 0,
      periodsUntilDue: LESSON_REVIEW_PERIODS,
    });
    expect(lessonReviewStanding(lesson, 4 + LESSON_REVIEW_PERIODS - 1)).toMatchObject({
      reviewDue: false,
      periodsUntilDue: 1,
    });
  });

  it("brings review due at the interval and keeps it due afterwards, without expiring anything", () => {
    const lesson = retained(4);
    expect(lessonReviewStanding(lesson, 4 + LESSON_REVIEW_PERIODS)).toMatchObject({
      reviewDue: true,
      periodsSinceRetention: LESSON_REVIEW_PERIODS,
      periodsUntilDue: 0,
    });
    expect(lessonReviewStanding(lesson, 900)).toMatchObject({
      reviewDue: true,
      periodsUntilDue: 0,
    });
    expect(lessonReviewStanding(lesson, 900).retention).toBe("retained");
  });

  it("never reports a provisional lesson as due, because it is unfinished rather than overdue", () => {
    expect(lessonReviewStanding(recorded(), 900)).toEqual({
      retention: "provisional",
      reviewDue: false,
      periodsSinceRetention: 0,
      periodsUntilDue: 0,
    });
  });

  it("never brings a superseded lesson due, because history does not come due", () => {
    expect(lessonReviewStanding(superseded(), 900)).toMatchObject({
      retention: "superseded",
      reviewDue: false,
    });
  });

  it("answers about a period before retention without objecting to the question", () => {
    expect(lessonReviewStanding(retained(4), 2)).toMatchObject({
      reviewDue: false,
      periodsSinceRetention: 0,
      periodsUntilDue: LESSON_REVIEW_PERIODS,
    });
  });
});

describe("deliberate absences", () => {
  it("publishes exactly the surface a lesson has and nothing more", () => {
    expect(Object.keys(lessonModule).sort()).toEqual([
      "isLessonProvisional",
      "isLessonRetained",
      "isLessonSuperseded",
      "lessonReviewStanding",
      "recordLesson",
      "retainLesson",
      "reviseLesson",
      "supersedeLesson",
    ]);
  });

  it("offers no way to declare a lesson learned without a commitment", () => {
    const names = Object.keys(lessonModule).join(" ").toLowerCase();
    for (const forbidden of ["marklearned", "commit", "remember", "learned", "certify"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("offers no way to expire, archive or discard what the institution concluded", () => {
    const names = Object.keys(lessonModule).join(" ").toLowerCase();
    for (const forbidden of ["expire", "archive", "delete", "purge", "forget", "reopen"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("mutates nothing it was given", () => {
    const lesson = recorded();
    const before = JSON.stringify(lesson);
    reviseLesson(lesson, `${STATEMENT} It is worst in the summer term.`, ["staff_capability"]);
    retainLesson(lesson, true, 6);
    expect(JSON.stringify(lesson)).toBe(before);
  });

  it("moves the updated stamp on every transition and never the created one", () => {
    const lesson = recorded();
    const moved = retainLesson(lesson, true, 6);
    expect(moved.createdAt).toBe(lesson.createdAt);
    expect(moved.id).toBe(lesson.id);
    expect(moved.lessonKey).toBe(lesson.lessonKey);
  });
});
