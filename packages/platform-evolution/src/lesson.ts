import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
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
  type CapabilityArea,
  INITIAL_LESSON_RETENTION,
  type LessonCategory,
  type LessonOrigin,
  type LessonRetention,
  isValidKey,
  isValidPeriod,
  normalizeKey,
} from "./evolution-value";
import type { LessonVerdict, ReviewStanding } from "./evolution-view";
import { inspectLesson, inspectRetentionChange, reviewStanding } from "./learning";

/**
 * A lesson: something the institution concluded from something that happened to it, and whether it has actually
 * been remembered.
 *
 * This is the second half of the contract's rule — *lessons feed institutional memory* — and the reason it needs
 * a type at all is that the sentence is false in almost every institution that would say it about itself. The
 * ordinary end of a retrospective is a document with eleven insights in it, and the ordinary fate of that
 * document is to be findable by the four people who were in the room until two of them leave. What is missing is
 * never the writing-down. It is the step after it, and there is no state anywhere that distinguishes an
 * organization that took that step from one that held the meeting.
 *
 * **Retention is the distinction, and it is not self-declared.** A lesson is born `provisional` and reaches
 * `retained` only when a memory commitment resolves against the institutional knowledge graph (P2-D25) —
 * {@link retainLesson} takes that answer as a parameter and refuses without it, because whether a commitment
 * resolved is P2-D25's question in P2-D25's vocabulary and a second opinion held here would be exactly the
 * self-certification the state exists to prevent. The consequence is that an institution running this platform
 * gets a real number for how much of what it concluded it actually retained, and the number will be low, and that
 * is the intervention rather than a defect in it.
 *
 * **Corrections supersede rather than overwrite.** A retained lesson's statement is frozen: cycles cite it,
 * lineage traces run through it, and every one of those references is to a sentence that must still say what it
 * said. Concluding the opposite later is a new lesson naming this one as the thing it replaces, and the replaced
 * lesson stays readable — because the fact that the institution once believed something else, and what changed
 * its mind, is a larger part of what it knows than the current conclusion is.
 *
 * **Review is derived, and nothing expires.** {@link lessonReviewStanding} answers whether the review interval
 * has elapsed as of a period the caller names; there is no stored due-date, no demotion and no deletion. A lesson
 * does not stop being true because eight periods passed. What has happened is that nobody has looked at it since,
 * which is a fact about the institution — and keeping it derived is what makes it decidable years later without
 * asking what today is or when a job last ran.
 *
 * `origin` and `originRef` are immutable, and together they are why a lesson is citable rather than merely
 * quotable: every lesson here is downstream of something that happened, named in the vocabulary of the domain it
 * happened in, and a lesson whose origin could be re-pointed would be an opinion that had acquired a footnote.
 */

// --- The aggregate ---------------------------------------------------------------

export interface Lesson {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** How a cycle, a lineage trace and a superseding lesson all address this conclusion. Immutable. */
  readonly lessonKey: string;
  /** What the institution concluded. Editable while provisional, frozen once it reaches memory. */
  readonly statement: string;
  /** What kind of thing the lesson is about. Fixed at recording, with the origin it was drawn from. */
  readonly category: LessonCategory;
  /** What produced it. Immutable: half of why the statement is citable rather than merely written down. */
  readonly origin: LessonOrigin;
  /** The record it came out of, in the origin's own scheme. Immutable and never dereferenced here. */
  readonly originRef: string;
  /** Whether it has actually reached institutional memory. Never set directly; see {@link retainLesson}. */
  readonly retention: LessonRetention;
  /** Recognised capability areas it speaks to, as the learning engine resolved them. */
  readonly areas: readonly CapabilityArea[];
  /** The period it entered memory, against which review falls due. `null` until it does. */
  readonly retainedAtPeriod: number | null;
  /** Who wrote it up. `null` for a lesson drawn by an automated review step. */
  readonly recordedBy: Uuid | null;
  readonly retainedAt: ISODateString | null;
  readonly supersededAt: ISODateString | null;
  /** The lesson that replaces this one, by key. Never this lesson's own key. */
  readonly supersedingLessonKey: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordLessonParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly lessonKey: string;
  readonly statement: string;
  readonly category: LessonCategory;
  readonly origin: LessonOrigin;
  readonly originRef: string;
  /** Capability areas as submitted. Unknown and repeated entries are dropped, not fatal. */
  readonly applicability: readonly string[];
  /** `null` for a lesson drawn by an automated step, which is permitted and concludes nothing on its own. */
  readonly recordedBy: Uuid | null;
}

// --- Recording -------------------------------------------------------------------

/**
 * Run the learning engine and refuse what it will not pass.
 *
 * The issue codes travel into the error rather than being summarised, so somebody writing up a retrospective is
 * told everything wrong with the draft at once. That is the whole reason the engine reports a list instead of
 * throwing on the first problem, and collapsing it back into one message here would spend the design and keep
 * none of it.
 */
function requireUsable(lessonKey: string, verdict: LessonVerdict): readonly CapabilityArea[] {
  if (!verdict.usable) {
    throw new UnusableLessonError(
      lessonKey,
      verdict.issues.map((issue) => issue.code),
    );
  }
  return verdict.areas;
}

/**
 * Write down what the institution concluded, and start it as `provisional`.
 *
 * `provisional` is not a draft state and there is no parameter that skips it. It is the accurate description of
 * a lesson that has been written and not yet committed anywhere, which is the state of very nearly every lesson
 * every institution has ever recorded, and the platform reports it as such from the first moment rather than
 * after somebody notices.
 *
 * Nothing here refuses a duplicate key. This package holds no directory of its own lessons, and a uniqueness
 * check invented inside an aggregate would be a second opinion about what exists.
 */
export function recordLesson(params: RecordLessonParams): Lesson {
  const lessonKey = normalizeKey(params.lessonKey);
  if (lessonKey.length === 0) throw new EmptyLessonKeyError();
  if (!isValidKey(lessonKey)) throw new InvalidLessonKeyError(lessonKey);

  const areas = requireUsable(
    lessonKey,
    inspectLesson({
      statement: params.statement,
      category: params.category,
      origin: params.origin,
      originRef: params.originRef,
      applicability: params.applicability,
    }),
  );

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    lessonKey,
    statement: params.statement.trim(),
    category: params.category,
    origin: params.origin,
    originRef: params.originRef.trim(),
    retention: INITIAL_LESSON_RETENTION,
    areas,
    retainedAtPeriod: null,
    recordedBy: params.recordedBy,
    retainedAt: null,
    supersededAt: null,
    supersedingLessonKey: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Restate the lesson and what it speaks to, while it is still provisional.
 *
 * One operation for both fields rather than two, and the draft is re-inspected as a whole. A statement narrowed
 * from "marking turnaround" to "year nine marking turnaround" almost always changes which areas it speaks to,
 * and two independent edits would let those two facts disagree for as long as nobody made the second one.
 *
 * The category and the origin are not revisable here. The origin is what makes the lesson citable and the
 * category is chosen with it; a lesson that turned out to be about something else is a different conclusion
 * drawn from the same event, which is a new lesson rather than an edit to this one.
 */
export function reviseLesson(
  lesson: Lesson,
  statement: string,
  applicability: readonly string[],
): Lesson {
  if (lesson.retention !== "provisional") {
    throw new LessonTextFrozenError(lesson.id, lesson.retention);
  }

  const areas = requireUsable(
    lesson.lessonKey,
    inspectLesson({
      statement,
      category: lesson.category,
      origin: lesson.origin,
      originRef: lesson.originRef,
      applicability,
    }),
  );

  return { ...lesson, statement: statement.trim(), areas, updatedAt: nowIso() };
}

// --- Retention -------------------------------------------------------------------

/**
 * Ask the learning engine whether a retention move is permitted, and raise the refusal it names.
 *
 * Six refusals get six error types rather than one, because they have six different remedies and only one of
 * them is *try again*. Being told a lesson is already retained is a resubmitted form. Being told its commitment
 * has not resolved is being told to go and commit it. Being told it cannot supersede itself is a caller that
 * passed the same key into both fields — which reads as correct in every log until somebody follows the pointer.
 */
function requireRetentionChange(
  lesson: Lesson,
  to: LessonRetention,
  commitmentResolved: boolean,
  supersededBy: string | null,
): void {
  const verdict = inspectRetentionChange({
    from: lesson.retention,
    to,
    lessonKey: lesson.lessonKey,
    commitmentResolved,
    supersededBy,
  });
  if (verdict.allowed) return;

  if (verdict.refusal === "same_retention") {
    throw new LessonAlreadyInRetentionError(lesson.id, lesson.retention);
  }
  if (verdict.refusal === "terminal_retention") {
    throw new LessonRetentionSettledError(lesson.id, lesson.retention);
  }
  if (verdict.refusal === "commitment_unresolved") {
    throw new MemoryCommitmentUnresolvedError(lesson.id);
  }
  if (verdict.refusal === "no_superseding_lesson") {
    throw new NoSupersedingLessonError(lesson.id);
  }
  if (verdict.refusal === "self_supersession") {
    throw new LessonSupersedesItselfError(lesson.id);
  }
  throw new InvalidRetentionProgressionError(lesson.id, lesson.retention, to);
}

/**
 * Move the lesson into institutional memory, on the strength of a resolved commitment.
 *
 * `commitmentResolved` is a parameter rather than something this aggregate works out, and that is the single
 * most load-bearing decision in the file. The knowledge graph owns whether a commitment resolved; a lesson that
 * could decide it locally would be a lesson that marks itself remembered, which is what every retrospective
 * document already does and is the precise failure this state was introduced to make visible.
 *
 * The period is validated before the move. An out-of-range period is a malformed request and a refused move is a
 * well-formed one the domain declines, and a caller who fixes the second only to discover the first has been
 * told the story backwards.
 */
export function retainLesson(
  lesson: Lesson,
  commitmentResolved: boolean,
  atPeriod: number,
): Lesson {
  if (!isValidPeriod(atPeriod)) throw new InvalidRetentionPeriodError(atPeriod);
  requireRetentionChange(lesson, "retained", commitmentResolved, null);

  const now = nowIso();
  return {
    ...lesson,
    retention: "retained",
    retainedAtPeriod: atPeriod,
    retainedAt: now,
    updatedAt: now,
  };
}

/**
 * Record that a later lesson has replaced this one.
 *
 * Only a retained lesson can be superseded, which falls out of the progression map rather than being checked
 * here: a provisional lesson nobody committed has not been replaced by anything, it has been abandoned, and
 * calling that supersession would let an institution report a corrected conclusion where it had in fact never
 * reached the first one.
 *
 * The successor is held as a key rather than an id, because the self-supersession rule is a key comparison and
 * because a lesson may name a replacement the reader has to be able to find without a join.
 */
export function supersedeLesson(lesson: Lesson, supersedingLessonKey: string): Lesson {
  const successor = normalizeKey(supersedingLessonKey);
  requireRetentionChange(lesson, "superseded", true, successor.length === 0 ? null : successor);

  const now = nowIso();
  return {
    ...lesson,
    retention: "superseded",
    supersedingLessonKey: successor,
    supersededAt: now,
    updatedAt: now,
  };
}

// --- Reading ---------------------------------------------------------------------

/** Written down and not yet committed anywhere. The honest state of most of what any institution concludes. */
export const isLessonProvisional = (lesson: Lesson): boolean => lesson.retention === "provisional";

/** Actually in institutional memory, on a commitment that resolved against the knowledge graph. */
export const isLessonRetained = (lesson: Lesson): boolean => lesson.retention === "retained";

/** Replaced by a later conclusion, and still readable, because having believed otherwise is part of knowing. */
export const isLessonSuperseded = (lesson: Lesson): boolean => lesson.retention === "superseded";

/**
 * Where the lesson stands against its review interval, as of a period the caller names.
 *
 * A reader rather than a rule: nothing here demotes, expires or deletes, and asking about period nine hundred is
 * a legitimate question with a legitimate answer rather than an error. Only a retained lesson can be due — a
 * provisional one is not overdue for review, it is unfinished, and a review queue that reported the two through
 * one flag would let an institution work through it and come out with its unfinished records ticked.
 */
export const lessonReviewStanding = (lesson: Lesson, asOfPeriod: number): ReviewStanding =>
  reviewStanding(lesson.retention, lesson.retainedAtPeriod, asOfPeriod);
