import { elapsedPeriods } from "./cadence";
import {
  type CapabilityArea,
  LESSON_REVIEW_PERIODS,
  type LessonRetention,
  MAX_LESSON_APPLICABILITY,
  MAX_LESSON_STATEMENT_LENGTH,
  MIN_LESSON_STATEMENT_LENGTH,
  isCapabilityArea,
  normalizeKey,
} from "./evolution-value";
import type {
  LessonDraft,
  LessonIssue,
  LessonVerdict,
  RetentionChangeRequest,
  RetentionVerdict,
  ReviewStanding,
} from "./evolution-view";

/**
 * The learning engine: what has to be true of a lesson before the institution records one, and what has to have
 * happened before it counts as something the institution knows.
 *
 * This is the module the contract's first clause lives in. Lessons feed institutional memory — and the word
 * doing the work in that sentence is *feed*, not *are*. Writing something down at the end of a retrospective is
 * not learning; it is the activity institutions substitute for learning, and they substitute it precisely
 * because it is indistinguishable from the real thing in every report. The retention rules here are the
 * distinction made structural: a lesson is born `provisional`, and the only way out of that state is a memory
 * commitment that actually resolved against the institutional knowledge graph (P2-D25). Nobody can mark a lesson
 * learned, and there is no parameter that would let them.
 *
 * The statement rules are less dramatic and do a related job. A minimum length is a crude instrument, and it is
 * here because the failure it prevents is crude: an institution whose lesson store fills with entries like
 * "communicate better" has a searchable index of nothing. The maximum is the opposite failure — a lesson long
 * enough to be a report is a report, and it will be read exactly once. Capping applicability at a handful of
 * areas serves the same end: a lesson that claims to apply everywhere has not been thought about, and it will
 * surface against every future question while answering none of them.
 *
 * Like every engine in this package it reports rather than throws, holds no clock, and stores nothing. Review
 * standing in particular is derived on demand from an explicit period, so the question "is this lesson due for
 * review" has the same answer for every reader who asks it about the same period, however long after the fact.
 */

// --- Statements ------------------------------------------------------------------

/**
 * Whether a lesson draft is well enough formed to record, and which capability areas it actually speaks to.
 *
 * Every issue is returned rather than the first, on the argument the rest of this contract makes: the caller is
 * a person at the end of a retrospective, and handing them one correction at a time is how a form gets abandoned
 * halfway through with the lessons still in somebody's notebook.
 *
 * Unknown and repeated areas are reported *and* dropped rather than being fatal. The lesson itself is not wrong
 * because somebody picked an area twice, and refusing the whole draft over it would trade a real lesson for a
 * tidy field. What is fatal is the statement and the origin reference, because those are the lesson — a record
 * with neither is an empty row with a category on it.
 */
export const inspectLesson = (draft: LessonDraft): LessonVerdict => {
  const issues: LessonIssue[] = [];
  const fault = (code: string): void => {
    issues.push({ code, areaIndex: null });
  };

  const statement = draft.statement.trim();
  if (statement.length === 0) fault("blank_statement");
  else if (statement.length < MIN_LESSON_STATEMENT_LENGTH) fault("statement_too_short");
  else if (statement.length > MAX_LESSON_STATEMENT_LENGTH) fault("statement_too_long");

  if (draft.originRef.trim().length === 0) fault("blank_origin_ref");

  const areas: CapabilityArea[] = [];
  const seen = new Set<string>();

  draft.applicability.forEach((entry, index) => {
    const area = normalizeKey(entry);
    if (!isCapabilityArea(area)) {
      issues.push({ code: "unknown_area", areaIndex: index });
      return;
    }
    if (seen.has(area)) {
      issues.push({ code: "duplicate_area", areaIndex: index });
      return;
    }
    seen.add(area);
    areas.push(area);
  });

  if (areas.length === 0) fault("no_applicability");
  if (areas.length > MAX_LESSON_APPLICABILITY) fault("too_many_areas");

  const blocking = issues.filter(
    (issue) => issue.code !== "unknown_area" && issue.code !== "duplicate_area",
  );

  return { usable: blocking.length === 0, areas, issues };
};

// --- Retention -------------------------------------------------------------------

/**
 * Which retention states a lesson may move to from each state it can be in.
 *
 * `provisional → retained → superseded`, one way, no shortcuts and no way back. The absence people notice first
 * is `provisional → superseded`, and it is absent deliberately. Superseding is what memory does to memory: it
 * says the institution once concluded this and has since concluded otherwise, and both halves of that sentence
 * matter. A lesson that never reached memory has nothing to be superseded *from*, and allowing the move would
 * hand every institution a tidy way to clear its unfinished records — mark the provisional ones superseded, and
 * the discomfort this domain is built around disappears without a single commitment having resolved.
 *
 * There is also no route out of `superseded`. A lesson the institution has moved past stays readable exactly as
 * it was, because the fact that it once believed something else is part of what it knows. Concluding the
 * original was right after all is a new lesson, with its own origin and its own commitment.
 *
 * Frozen at both levels, for the reason the other progression maps in this package are.
 */
export const RETENTION_PROGRESSIONS: Readonly<Record<LessonRetention, readonly LessonRetention[]>> =
  Object.freeze({
    provisional: Object.freeze<LessonRetention[]>(["retained"]),
    retained: Object.freeze<LessonRetention[]>(["superseded"]),
    superseded: Object.freeze<LessonRetention[]>([]),
  });

/**
 * Whether a lesson may make the retention move somebody asked for, and if not, which kind of not.
 *
 * `commitment_unresolved` is the refusal this contract exists for. It fires when a caller asks to retain a
 * lesson whose memory commitment has not resolved, which is the ordinary case at the end of every retrospective
 * anybody has ever run, and it is why the domain has a `provisional` state at all. The remedy is not to try
 * again; it is to commit the lesson to the knowledge graph and come back when that resolved.
 *
 * The two supersession refusals are kept apart because they mean different things. `no_superseding_lesson` is an
 * incomplete request — the institution has decided something replaces this and has not said what. `self_supersession`
 * is an incoherent one, and it is worth its own code because the shape it arrives in is a caller passing the
 * lesson it is editing into both fields, which reads as correct in every log until somebody follows the pointer.
 */
export const inspectRetentionChange = (request: RetentionChangeRequest): RetentionVerdict => {
  const { from, to } = request;
  const refuse = (refusal: RetentionVerdict["refusal"]): RetentionVerdict => ({
    allowed: false,
    from,
    to,
    refusal,
  });

  if (from === to) return refuse("same_retention");
  if (RETENTION_PROGRESSIONS[from].length === 0) return refuse("terminal_retention");
  if (!RETENTION_PROGRESSIONS[from].includes(to)) return refuse("unreachable_retention");

  if (to === "retained" && !request.commitmentResolved) return refuse("commitment_unresolved");

  if (to === "superseded") {
    const successor = request.supersededBy?.trim() ?? "";
    if (successor.length === 0) return refuse("no_superseding_lesson");
    if (normalizeKey(successor) === normalizeKey(request.lessonKey)) {
      return refuse("self_supersession");
    }
  }

  return { allowed: true, from, to, refusal: null };
};

// --- Review ----------------------------------------------------------------------

/**
 * Where a lesson stands against its review interval, as of a period the caller names.
 *
 * Only a `retained` lesson can be due. A provisional lesson is not overdue for review, it is unfinished, and
 * reporting the two through the same flag would let an institution work through a review queue and come out
 * with its unfinished records still unfinished and now also ticked. A superseded lesson is history and history
 * does not come due.
 *
 * `retainedAtPeriod` is nullable because a lesson that never reached memory has no such period, and the honest
 * answer to when it entered is not zero. Passing `null` yields zeros and a `reviewDue` of `false` — not because
 * the lesson is fine, but because this is not the function that has an opinion about it. {@link file://./lineage.ts}
 * is.
 */
export const reviewStanding = (
  retention: LessonRetention,
  retainedAtPeriod: number | null,
  asOfPeriod: number,
): ReviewStanding => {
  if (retention !== "retained" || retainedAtPeriod === null) {
    return { retention, reviewDue: false, periodsSinceRetention: 0, periodsUntilDue: 0 };
  }

  const elapsed = elapsedPeriods(retainedAtPeriod, asOfPeriod);
  const remaining = LESSON_REVIEW_PERIODS - elapsed;

  return {
    retention,
    reviewDue: elapsed >= LESSON_REVIEW_PERIODS,
    periodsSinceRetention: elapsed,
    periodsUntilDue: remaining > 0 ? remaining : 0,
  };
};
