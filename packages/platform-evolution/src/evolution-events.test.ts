import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { concludeReview, observeBenefit, openReview, recordBenefit } from "./adoption-review";
import {
  AREA_ASSESSED,
  ASSESSMENT_OPENED,
  ASSESSMENT_PUBLISHED,
  BALLOT_CAST,
  BENEFIT_CLAIMED,
  BENEFIT_OBSERVED,
  CYCLE_ABANDONED,
  CYCLE_CLOSED,
  CYCLE_EXECUTION_STARTED,
  CYCLE_OPENED,
  CYCLE_RESCHEDULED,
  CYCLE_RESTATED,
  CYCLE_REVIEW_STARTED,
  GATE_CONVOKED,
  GATE_REFUSED,
  GATE_SATISFIED,
  INITIATIVE_ADOPTED,
  INITIATIVE_APPROVED,
  INITIATIVE_PILOT_STARTED,
  INITIATIVE_PROPOSED,
  INITIATIVE_RECLASSIFIED,
  INITIATIVE_REJECTED,
  INITIATIVE_RESTATED,
  INITIATIVE_REVIEW_STARTED,
  INITIATIVE_SUBMITTED,
  INITIATIVE_WITHDRAWN,
  LESSON_RECORDED,
  LESSON_RETAINED,
  LESSON_REVISED,
  LESSON_SUPERSEDED,
  REVIEW_CONCLUDED,
  REVIEW_OPENED,
  SIGNAL_ACCEPTED,
  SIGNAL_CORROBORATED,
  SIGNAL_DECLINED,
  SIGNAL_MERGED,
  SIGNAL_RAISED,
  SIGNAL_RESTATED,
  SIGNAL_TRIAGED,
  areaAssessed,
  assessmentOpened,
  assessmentPublished,
  ballotCast,
  benefitClaimed,
  benefitObserved,
  cycleAbandoned,
  cycleClosed,
  cycleExecutionStarted,
  cycleOpened,
  cycleRescheduled,
  cycleRestated,
  cycleReviewStarted,
  gateConvoked,
  gateRefused,
  gateSatisfied,
  initiativeAdopted,
  initiativeApproved,
  initiativePilotStarted,
  initiativeProposed,
  initiativeReclassified,
  initiativeRejected,
  initiativeRestated,
  initiativeReviewStarted,
  initiativeSubmitted,
  initiativeWithdrawn,
  lessonRecorded,
  lessonRetained,
  lessonRevised,
  lessonSuperseded,
  reviewConcluded,
  reviewOpened,
  signalAccepted,
  signalCorroborated,
  signalDeclined,
  signalMerged,
  signalRaised,
  signalRestated,
  signalTriaged,
} from "./evolution-events";
import { CAPABILITY_AREAS } from "./evolution-value";
import type { AreaWeight, EvidenceCitation } from "./evolution-view";
import { castBallot, convokeGate } from "./governance-decision";
import {
  abandonCycle,
  closeCycle,
  openCycle,
  rescheduleCycle,
  reviseCycleIntent,
  startCycleExecution,
  startCycleReview,
} from "./improvement-cycle";
import {
  adoptInitiative,
  approveInitiative,
  proposeInitiative,
  reclassifyInitiative,
  rejectInitiative,
  reviseInitiativeSummary,
  startInitiativePilot,
  startInitiativeReview,
  submitInitiative,
  withdrawInitiative,
} from "./improvement-initiative";
import {
  acceptSignal,
  corroborateSignal,
  declineSignal,
  mergeSignal,
  raiseSignal,
  reviseSignalSummary,
  triageSignal,
} from "./improvement-signal";
import { recordLesson, retainLesson, reviseLesson, supersedeLesson } from "./lesson";
import {
  type MaturityAssessment,
  openAssessment,
  publishAssessment,
  recordAreaReading,
} from "./maturity-assessment";

const TENANT = "t1" as TenantId;
const ORG = "org1" as Uuid;
const INITIATIVE = "initiative-1" as Uuid;
const MERGE_TARGET = "signal-7701" as Uuid;

/**
 * The sentences that must not travel, chosen so that finding one on the wire is unambiguous.
 *
 * Every one of them is compulsory somewhere in this domain — a signal cannot be raised without a summary, a
 * decline cannot be recorded without a reason — and that is precisely why none of them may be broadcast. Text
 * an institution is required to write about itself is text somebody was promised would be read by the people
 * entitled to read it, and a bus has no way to honour that.
 */
const SIGNAL_SUMMARY = "Year nine marking has taken more than a fortnight since January";
const REVISED_SUMMARY = "Year nine marking slips whenever moderation lands in a reporting week";
const INITIATIVE_SUMMARY = "Move year nine marking to a two-week turnaround from next term";
const REVISED_INITIATIVE = "Move year nine marking to a two-week turnaround from the spring";
const LESSON_STATEMENT = "Marking slips whenever a moderation window overlaps a reporting deadline";
const REVISED_STATEMENT = "Marking slips whenever moderation and reporting fall in one fortnight";
const CYCLE_INTENT =
  "Shorten the gap between a marking concern being raised and something changing";
const REVISED_INTENT = "Shorten the gap between a marking concern and a change, and measure it";
const RATIONALE = "The two-week turnaround is achievable at the current marking load";
const CONDITION = "Reviewed again at the end of the autumn term";
const DECLINE_REASON = "The timetable review already answers this";
const WITHDRAWAL_REASON = "Superseded by the moderation calendar change";
const ABANDONMENT_REASON = "The moderation calendar changed underneath the round";

const FREE_TEXT = [
  SIGNAL_SUMMARY,
  REVISED_SUMMARY,
  INITIATIVE_SUMMARY,
  REVISED_INITIATIVE,
  LESSON_STATEMENT,
  REVISED_STATEMENT,
  CYCLE_INTENT,
  REVISED_INTENT,
  RATIONALE,
  CONDITION,
  DECLINE_REASON,
  WITHDRAWAL_REASON,
  ABANDONMENT_REASON,
];

const RAISER = "user-2201" as Uuid;
const WITNESS = "user-3302" as Uuid;
const TRIAGER = "user-4403" as Uuid;
const DECIDER_ONE = "user-5504" as Uuid;
const DECIDER_TWO = "user-6605" as Uuid;
const ACTOR = "user-7706" as Uuid;

const PEOPLE = [RAISER, WITNESS, TRIAGER, DECIDER_ONE, DECIDER_TWO, ACTOR];

/**
 * The figures that must not travel, chosen so that finding one on the wire is unambiguous.
 *
 * A benefit's baseline, target and observation are the institution's own units, and the movement between them
 * is arithmetic anybody downstream would have to guess the meaning of. What this contract publishes is the
 * fraction of the promise that was kept, which is comparable across measures that share nothing else.
 */
const BASELINE = 61.5;
const TARGET = 88.25;
const OBSERVED = 74.875;
const PROMISED = 26.75;
const ACHIEVED = 13.375;

const RAW_FIGURES = [BASELINE, TARGET, OBSERVED, PROMISED, ACHIEVED].map(String);

/** Two areas carry weights no count in any payload can be confused with. The rest split what is left. */
const HEAVY_WEIGHT = 0.13;
const LIGHT_WEIGHT = 0.07;

const WEIGHTS: readonly AreaWeight[] = CAPABILITY_AREAS.map((area, position) => ({
  area,
  weight: position === 0 ? HEAVY_WEIGHT : position === 1 ? LIGHT_WEIGHT : 0.1,
}));

const WEIGHT_FIGURES = [HEAVY_WEIGHT, LIGHT_WEIGHT].map(String);

/** High enough that an assessment quoting it would be quoting something, and never quoted here. */
const AREA_SCORE = 5;
const AREA_EVIDENCE = 6;

const cite = (ref: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "assessment",
  sourceRef: ref,
  attestedBy: null,
});

const raised = raiseSignal({
  tenantId: TENANT,
  organizationId: ORG,
  signalKey: "academic.marking-turnaround",
  source: "stakeholder_feedback",
  summary: SIGNAL_SUMMARY,
  citations: [cite("assessment-9001"), cite("assessment-9002")],
  raisedBy: RAISER,
});
const corroborated = corroborateSignal(raised, { raisedBy: WITNESS, source: "incident" });
const triaged = triageSignal(raised, TRIAGER);
const accepted = acceptSignal(triaged, TRIAGER);

const drafted = proposeInitiative({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeKey: "academic.marking-turnaround",
  changeClass: "process",
  summary: INITIATIVE_SUMMARY,
  originatingSignalIds: [accepted.id],
  proposedBy: RAISER,
});
const submitted = submitInitiative(drafted);
const underReview = startInitiativeReview(submitted);
const approved = approveInitiative(underReview, "satisfied");

/** The period the pilot starts in. Adoption needs at least one whole period after it. */
const PILOT_START = 4;

const piloting = startInitiativePilot(approved, PILOT_START);
const adopted = adoptInitiative(piloting, "satisfied", PILOT_START + 1, ACTOR);

const convoked = convokeGate({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeId: INITIATIVE,
  gate: "approval",
  changeClass: "policy",
  proposedBy: RAISER,
  convokedBy: ACTOR,
});
const conditioned = castBallot(convoked, {
  deciderId: DECIDER_ONE,
  verdict: "approved_with_conditions",
  rationale: RATIONALE,
  conditions: [CONDITION],
});
const settled = castBallot(conditioned, {
  deciderId: DECIDER_TWO,
  verdict: "approved",
  rationale: RATIONALE,
  conditions: [],
});
const refused = castBallot(conditioned, {
  deciderId: DECIDER_TWO,
  verdict: "rejected",
  rationale: RATIONALE,
  conditions: [],
});
const deferred = castBallot(convoked, {
  deciderId: DECIDER_ONE,
  verdict: "deferred",
  rationale: RATIONALE,
  conditions: [],
});

const recorded = recordLesson({
  tenantId: TENANT,
  organizationId: ORG,
  lessonKey: "academic.marking-turnaround",
  statement: LESSON_STATEMENT,
  category: "process",
  origin: "cycle_retrospective",
  originRef: "cycle-2026-autumn",
  applicability: ["academic_practice", "operational_process"],
  recordedBy: RAISER,
});

/** The period the lesson entered memory in. Distinct from every other period in these fixtures. */
const RETAINED_PERIOD = 5;

const retained = retainLesson(recorded, true, RETAINED_PERIOD);

const planning = openCycle({
  tenantId: TENANT,
  organizationId: ORG,
  cycleKey: "academic.autumn-improvement",
  intent: CYCLE_INTENT,
  startPeriod: 4,
  endPeriod: 7,
  openedBy: RAISER,
});
const executing = startCycleExecution(planning);
const reviewing = startCycleReview(executing);

/** Lessons the round produced. A cycle that recorded none cannot close, which is the point of the count. */
const LESSONS_RECORDED = 3;

const opened = openAssessment({
  tenantId: TENANT,
  organizationId: ORG,
  assessmentKey: "annual.self-assessment",
  period: 3,
  weights: WEIGHTS,
  openedBy: RAISER,
});
const assessed = recordAreaReading(opened, {
  area: "academic_practice",
  score: AREA_SCORE,
  evidenceCount: AREA_EVIDENCE,
});

/** Seven of ten areas read with evidence, which is the least that clears the coverage floor. */
const covered = CAPABILITY_AREAS.slice(0, 7).reduce<MaturityAssessment>(
  (assessment, area) =>
    recordAreaReading(assessment, { area, score: AREA_SCORE, evidenceCount: AREA_EVIDENCE }),
  opened,
);
const publishedAssessment = publishAssessment(covered, ACTOR);

const MEASURE = "academic.marking-turnaround-days";

const openedReview = openReview({
  tenantId: TENANT,
  organizationId: ORG,
  initiativeId: INITIATIVE,
  reviewPeriod: 6,
  openedBy: RAISER,
});
const claimedReview = recordBenefit(openedReview, {
  measureKey: MEASURE,
  direction: "increase",
  baseline: BASELINE,
  target: TARGET,
});
const observedReview = observeBenefit(claimedReview, MEASURE, OBSERVED);
const claimedBenefit = claimedReview.benefits[0]!;
const observedBenefit = observedReview.benefits[0]!;

describe("the events an improvement signal produces", () => {
  it("names every transition on the evolution namespace under its own family", () => {
    expect(signalRaised(raised).type).toBe(SIGNAL_RAISED);
    expect(signalRestated(reviseSignalSummary(raised, REVISED_SUMMARY)).type).toBe(SIGNAL_RESTATED);
    expect(signalCorroborated(corroborated).type).toBe(SIGNAL_CORROBORATED);
    expect(signalTriaged(triaged).type).toBe(SIGNAL_TRIAGED);
    expect(signalAccepted(accepted).type).toBe(SIGNAL_ACCEPTED);
    expect(signalMerged(mergeSignal(triaged, MERGE_TARGET, TRIAGER)).type).toBe(SIGNAL_MERGED);
    expect(signalDeclined(declineSignal(triaged, TRIAGER, DECLINE_REASON)).type).toBe(
      SIGNAL_DECLINED,
    );
  });

  it("carries the signal's identity, where it was heard and how far it has got", () => {
    expect(signalRaised(raised).payload).toMatchObject({
      signalId: raised.id,
      organizationId: ORG,
      signalKey: "academic.marking-turnaround",
      source: "stakeholder_feedback",
      status: "raised",
      settled: false,
    });
  });

  it("sends the priority with the four counts it was derived from, so nobody takes it on trust", () => {
    expect(signalCorroborated(corroborated).payload).toMatchObject({
      priority: corroborated.priority,
      corroboration: corroborated.corroboration,
      repeatAccounts: corroborated.repeatAccounts,
      unattributed: corroborated.unattributed,
      selfEvident: corroborated.selfEvident,
    });
  });

  it("counts the evidence behind a signal without sending any of it", () => {
    const payload = signalRaised(raised).payload;

    expect(payload.citationCount).toBe(2);
    expect(JSON.stringify(payload)).not.toContain("assessment-9001");
  });

  it("names the signal a merge folded this one into, and null on every other ending", () => {
    expect(signalMerged(mergeSignal(triaged, MERGE_TARGET, TRIAGER)).payload).toMatchObject({
      status: "merged",
      settled: true,
      mergedIntoSignalId: MERGE_TARGET,
    });
    expect(signalAccepted(accepted).payload.mergedIntoSignalId).toBeNull();
  });

  it("leaves the summary and the decline's reason in the domain", () => {
    const declined = declineSignal(triaged, TRIAGER, DECLINE_REASON);
    const wire = JSON.stringify(signalDeclined(declined).payload);

    expect(declined.declineReason).toBe(DECLINE_REASON);
    expect(wire).not.toContain(DECLINE_REASON);
    expect(wire).not.toContain(SIGNAL_SUMMARY);
  });
});

describe("the events an improvement initiative produces", () => {
  it("names every transition on the evolution namespace under its own family", () => {
    expect(initiativeProposed(drafted).type).toBe(INITIATIVE_PROPOSED);
    expect(initiativeRestated(reviseInitiativeSummary(drafted, REVISED_INITIATIVE)).type).toBe(
      INITIATIVE_RESTATED,
    );
    expect(initiativeReclassified(reclassifyInitiative(drafted, "policy")).type).toBe(
      INITIATIVE_RECLASSIFIED,
    );
    expect(initiativeSubmitted(submitted).type).toBe(INITIATIVE_SUBMITTED);
    expect(initiativeReviewStarted(underReview).type).toBe(INITIATIVE_REVIEW_STARTED);
    expect(initiativeApproved(approved).type).toBe(INITIATIVE_APPROVED);
    expect(initiativeRejected(rejectInitiative(underReview, ACTOR)).type).toBe(INITIATIVE_REJECTED);
    expect(initiativePilotStarted(piloting).type).toBe(INITIATIVE_PILOT_STARTED);
    expect(initiativeAdopted(adopted).type).toBe(INITIATIVE_ADOPTED);
    expect(initiativeWithdrawn(withdrawInitiative(drafted, ACTOR, WITHDRAWAL_REASON)).type).toBe(
      INITIATIVE_WITHDRAWN,
    );
  });

  it("carries the change's identity and how big the institution says it is", () => {
    expect(initiativeProposed(drafted).payload).toMatchObject({
      initiativeId: drafted.id,
      organizationId: ORG,
      initiativeKey: "academic.marking-turnaround",
      changeClass: "process",
      status: "draft",
      settled: false,
      adopted: false,
    });
  });

  it("says how many reported problems the change answers, and points at none of them", () => {
    const payload = initiativeProposed(drafted).payload;

    expect(payload.originatingSignalCount).toBe(1);
    expect(JSON.stringify(payload)).not.toContain(accepted.id);
  });

  it("reports the period a pilot began in, and null before one has", () => {
    expect(initiativePilotStarted(piloting).payload.pilotStartedPeriod).toBe(PILOT_START);
    expect(initiativeApproved(approved).payload.pilotStartedPeriod).toBeNull();
  });

  it("flags adoption separately from settlement, because the two mean different things downstream", () => {
    expect(initiativeAdopted(adopted).payload).toMatchObject({ settled: true, adopted: true });
    expect(
      initiativeWithdrawn(withdrawInitiative(drafted, ACTOR, WITHDRAWAL_REASON)).payload,
    ).toMatchObject({ settled: true, adopted: false });
  });

  it("leaves the summary and the withdrawal's reason in the domain", () => {
    const withdrawn = withdrawInitiative(drafted, ACTOR, WITHDRAWAL_REASON);
    const wire = JSON.stringify(initiativeWithdrawn(withdrawn).payload);

    expect(withdrawn.withdrawalReason).toBe(WITHDRAWAL_REASON);
    expect(wire).not.toContain(WITHDRAWAL_REASON);
    expect(wire).not.toContain(INITIATIVE_SUMMARY);
  });
});

describe("the events a governance gate produces", () => {
  it("names every transition on the evolution namespace under its own family", () => {
    expect(gateConvoked(convoked).type).toBe(GATE_CONVOKED);
    expect(ballotCast(conditioned).type).toBe(BALLOT_CAST);
    expect(gateSatisfied(settled).type).toBe(GATE_SATISFIED);
    expect(gateRefused(refused).type).toBe(GATE_REFUSED);
  });

  it("carries which question was asked about which change, and at what reach", () => {
    expect(gateConvoked(convoked).payload).toMatchObject({
      decisionId: convoked.id,
      organizationId: ORG,
      initiativeId: INITIATIVE,
      gate: "approval",
      changeClass: "policy",
      outcome: "pending",
    });
  });

  it("sends the arithmetic a chasing notification is built from", () => {
    expect(gateConvoked(convoked).payload).toMatchObject({
      required: 2,
      affirmed: 0,
      outstanding: 2,
      ballotsCast: 0,
    });
    expect(ballotCast(conditioned).payload).toMatchObject({
      affirmed: 1,
      outstanding: 1,
      conditional: 1,
      ballotsCast: 1,
    });
  });

  it("says somebody refused without saying who, and never lets a count outvote it", () => {
    expect(gateRefused(refused).payload).toMatchObject({
      outcome: "refused",
      refused: true,
      affirmed: 1,
    });
  });

  it("counts deferrals as neither agreement nor refusal", () => {
    expect(ballotCast(deferred).payload).toMatchObject({
      outcome: "pending",
      deferrals: 1,
      affirmed: 0,
      refused: false,
    });
  });

  it("counts the conditions attached to an approval and sends none of their text", () => {
    const payload = gateSatisfied(settled).payload;

    expect(payload).toMatchObject({ outcome: "satisfied", conditionCount: 1 });
    expect(JSON.stringify(payload)).not.toContain(CONDITION);
  });

  it("leaves every decider and every rationale in the domain", () => {
    const wire = JSON.stringify(gateSatisfied(settled).payload);

    expect(wire).not.toContain(DECIDER_ONE);
    expect(wire).not.toContain(DECIDER_TWO);
    expect(wire).not.toContain(RATIONALE);
  });
});

describe("the events a lesson produces", () => {
  it("names every transition on the evolution namespace under its own family", () => {
    expect(lessonRecorded(recorded).type).toBe(LESSON_RECORDED);
    expect(
      lessonRevised(reviseLesson(recorded, REVISED_STATEMENT, ["academic_practice"])).type,
    ).toBe(LESSON_REVISED);
    expect(lessonRetained(retained).type).toBe(LESSON_RETAINED);
    expect(lessonSuperseded(supersedeLesson(retained, "academic.moderation-calendar")).type).toBe(
      LESSON_SUPERSEDED,
    );
  });

  it("carries what kind of thing was learned and what produced it", () => {
    expect(lessonRecorded(recorded).payload).toMatchObject({
      lessonId: recorded.id,
      organizationId: ORG,
      lessonKey: "academic.marking-turnaround",
      category: "process",
      origin: "cycle_retrospective",
      originRef: "cycle-2026-autumn",
    });
  });

  it("routes on the capability areas it bears on, which are the only vocabulary a subscriber has", () => {
    expect(lessonRecorded(recorded).payload.areas).toEqual([
      "academic_practice",
      "operational_process",
    ]);
  });

  it("separates having written a lesson down from having remembered it", () => {
    expect(lessonRecorded(recorded).payload).toMatchObject({
      retention: "provisional",
      retained: false,
      retainedAtPeriod: null,
    });
    expect(lessonRetained(retained).payload).toMatchObject({
      retention: "retained",
      retained: true,
      retainedAtPeriod: RETAINED_PERIOD,
    });
  });

  it("names the later lesson that replaced it, and null while none has", () => {
    expect(
      lessonSuperseded(supersedeLesson(retained, "academic.moderation-calendar")).payload,
    ).toMatchObject({
      retention: "superseded",
      supersedingLessonKey: "academic.moderation-calendar",
    });
    expect(lessonRetained(retained).payload.supersedingLessonKey).toBeNull();
  });

  it("leaves what the institution admitted about itself in the domain", () => {
    const wire = JSON.stringify(lessonRetained(retained).payload);

    expect(retained.statement).toBe(LESSON_STATEMENT);
    expect(wire).not.toContain(LESSON_STATEMENT);
  });
});

describe("the events an improvement cycle produces", () => {
  it("names every transition on the evolution namespace under its own family", () => {
    expect(cycleOpened(planning).type).toBe(CYCLE_OPENED);
    expect(cycleRestated(reviseCycleIntent(planning, REVISED_INTENT)).type).toBe(CYCLE_RESTATED);
    expect(cycleRescheduled(rescheduleCycle(planning, 5, 9)).type).toBe(CYCLE_RESCHEDULED);
    expect(cycleExecutionStarted(executing).type).toBe(CYCLE_EXECUTION_STARTED);
    expect(cycleReviewStarted(reviewing).type).toBe(CYCLE_REVIEW_STARTED);
    expect(cycleClosed(closeCycle(reviewing, "satisfied", LESSONS_RECORDED, ACTOR)).type).toBe(
      CYCLE_CLOSED,
    );
    expect(cycleAbandoned(abandonCycle(executing, ACTOR, ABANDONMENT_REASON)).type).toBe(
      CYCLE_ABANDONED,
    );
  });

  it("carries the round's identity and the stage it has reached", () => {
    expect(cycleOpened(planning).payload).toMatchObject({
      cycleId: planning.id,
      organizationId: ORG,
      cycleKey: "academic.autumn-improvement",
      stage: "planning",
      settled: false,
    });
  });

  it("sends the span's start, its end and its length, so nothing downstream has to count", () => {
    expect(cycleOpened(planning).payload).toMatchObject({
      startPeriod: 4,
      endPeriod: 7,
      periods: 4,
    });
    expect(cycleRescheduled(rescheduleCycle(planning, 5, 9)).payload).toMatchObject({
      startPeriod: 5,
      endPeriod: 9,
      periods: 5,
    });
  });

  it("reports what the round actually produced, which is why it was allowed to close", () => {
    expect(
      cycleClosed(closeCycle(reviewing, "satisfied", LESSONS_RECORDED, ACTOR)).payload,
    ).toMatchObject({
      stage: "closed",
      lessonsRecorded: LESSONS_RECORDED,
      settled: true,
    });
  });

  it("broadcasts the honest ending as loudly as the successful one", () => {
    expect(
      cycleAbandoned(abandonCycle(executing, ACTOR, ABANDONMENT_REASON)).payload,
    ).toMatchObject({ stage: "abandoned", lessonsRecorded: 0, settled: true });
  });

  it("leaves the intent and the abandonment's reason in the domain", () => {
    const abandoned = abandonCycle(executing, ACTOR, ABANDONMENT_REASON);
    const wire = JSON.stringify(cycleAbandoned(abandoned).payload);

    expect(abandoned.abandonmentReason).toBe(ABANDONMENT_REASON);
    expect(wire).not.toContain(ABANDONMENT_REASON);
    expect(wire).not.toContain(CYCLE_INTENT);
  });
});

describe("the events a maturity assessment produces", () => {
  it("names every transition on the evolution namespace under its own family", () => {
    expect(assessmentOpened(opened).type).toBe(ASSESSMENT_OPENED);
    expect(areaAssessed(assessed, "academic_practice", AREA_EVIDENCE).type).toBe(AREA_ASSESSED);
    expect(assessmentPublished(publishedAssessment).type).toBe(ASSESSMENT_PUBLISHED);
  });

  it("carries the assessment's identity and where on the grid it sits", () => {
    expect(assessmentOpened(opened).payload).toMatchObject({
      assessmentId: opened.id,
      organizationId: ORG,
      assessmentKey: "annual.self-assessment",
      period: 3,
    });
  });

  it("withholds the index and its level until somebody published them", () => {
    expect(assessmentOpened(assessed).payload).toMatchObject({
      index: null,
      level: null,
      published: false,
    });
    expect(assessmentPublished(publishedAssessment).payload).toMatchObject({
      index: publishedAssessment.index,
      level: publishedAssessment.level,
      published: true,
    });
    expect(assessmentPublished(publishedAssessment).payload.index).not.toBeNull();
  });

  it("sends coverage from the start, because it is what qualifies a number nobody has yet", () => {
    expect(assessmentOpened(assessed).payload).toMatchObject({
      coverage: assessed.coverage,
      areasReported: 1,
      publishable: false,
    });
    expect(assessmentOpened(covered).payload).toMatchObject({
      areasReported: 7,
      publishable: true,
      index: null,
    });
  });

  it("says which area was read and how much stood behind it, and never what it scored", () => {
    const event = areaAssessed(assessed, "academic_practice", AREA_EVIDENCE);

    expect(event.payload).toMatchObject({
      area: "academic_practice",
      evidenceCount: AREA_EVIDENCE,
    });
    expect(event.payload).not.toHaveProperty("score");
    expect(event.payload).not.toHaveProperty("areas");
  });

  it("leaves the declared weighting in the domain, on every event in the series", () => {
    const wire = JSON.stringify([
      assessmentOpened(opened).payload,
      areaAssessed(assessed, "academic_practice", AREA_EVIDENCE).payload,
      assessmentPublished(publishedAssessment).payload,
    ]);

    for (const figure of WEIGHT_FIGURES) {
      expect(wire).not.toContain(figure);
    }
  });
});

describe("the events an adoption review produces", () => {
  it("names every transition on the evolution namespace under its own family", () => {
    expect(reviewOpened(openedReview).type).toBe(REVIEW_OPENED);
    expect(benefitClaimed(claimedReview, claimedBenefit).type).toBe(BENEFIT_CLAIMED);
    expect(benefitObserved(observedReview, observedBenefit).type).toBe(BENEFIT_OBSERVED);
    expect(reviewConcluded(concludeReview(observedReview, ACTOR)).type).toBe(REVIEW_CONCLUDED);
  });

  it("carries which change was looked at and how long after adoption", () => {
    expect(reviewOpened(openedReview).payload).toMatchObject({
      reviewId: openedReview.id,
      organizationId: ORG,
      initiativeId: INITIATIVE,
      reviewPeriod: 6,
      concluded: false,
    });
  });

  it("reports what was measured beside what was promised, which is the review's own honesty", () => {
    expect(benefitObserved(observedReview, observedBenefit).payload).toMatchObject({
      measureKey: MEASURE,
      direction: "increase",
      observed: true,
    });
    expect(reviewOpened(observedReview).payload).toMatchObject({
      benefitsClaimed: 1,
      benefitsMeasured: 1,
    });
  });

  it("publishes the fraction of the promise that was kept and the band it landed in", () => {
    const payload = benefitObserved(observedReview, observedBenefit).payload;

    expect(payload.ratio).toBeCloseTo(0.5, 6);
    expect(payload.band).toBe("shortfall");
  });

  it("marks a claim that nobody has looked at yet as unobserved rather than as a zero", () => {
    expect(benefitClaimed(claimedReview, claimedBenefit).payload).toMatchObject({
      observed: false,
      band: null,
      ratio: 0,
    });
  });

  it("carries the verdict and the severest band it came from", () => {
    expect(reviewConcluded(concludeReview(observedReview, ACTOR)).payload).toMatchObject({
      verdict: "adjust",
      worstBand: "shortfall",
      concluded: true,
    });
  });

  it("leaves the baseline, the target and the observation in the domain", () => {
    const wire = JSON.stringify([
      benefitClaimed(claimedReview, claimedBenefit).payload,
      benefitObserved(observedReview, observedBenefit).payload,
    ]);

    for (const figure of RAW_FIGURES) {
      expect(wire).not.toContain(figure);
    }
  });
});

describe("what never leaves this domain", () => {
  const everyEvent = (): readonly DomainEvent[] => [
    signalRaised(raised),
    signalRestated(reviseSignalSummary(raised, REVISED_SUMMARY)),
    signalCorroborated(corroborated),
    signalTriaged(triaged),
    signalAccepted(accepted),
    signalMerged(mergeSignal(triaged, MERGE_TARGET, TRIAGER)),
    signalDeclined(declineSignal(triaged, TRIAGER, DECLINE_REASON)),
    initiativeProposed(drafted),
    initiativeRestated(reviseInitiativeSummary(drafted, REVISED_INITIATIVE)),
    initiativeReclassified(reclassifyInitiative(drafted, "policy")),
    initiativeSubmitted(submitted),
    initiativeReviewStarted(underReview),
    initiativeApproved(approved),
    initiativeRejected(rejectInitiative(underReview, ACTOR)),
    initiativePilotStarted(piloting),
    initiativeAdopted(adopted),
    initiativeWithdrawn(withdrawInitiative(drafted, ACTOR, WITHDRAWAL_REASON)),
    gateConvoked(convoked),
    ballotCast(conditioned),
    gateSatisfied(settled),
    gateRefused(refused),
    lessonRecorded(recorded),
    lessonRevised(reviseLesson(recorded, REVISED_STATEMENT, ["academic_practice"])),
    lessonRetained(retained),
    lessonSuperseded(supersedeLesson(retained, "academic.moderation-calendar")),
    cycleOpened(planning),
    cycleRestated(reviseCycleIntent(planning, REVISED_INTENT)),
    cycleRescheduled(rescheduleCycle(planning, 5, 9)),
    cycleExecutionStarted(executing),
    cycleReviewStarted(reviewing),
    cycleClosed(closeCycle(reviewing, "satisfied", LESSONS_RECORDED, ACTOR)),
    cycleAbandoned(abandonCycle(executing, ACTOR, ABANDONMENT_REASON)),
    assessmentOpened(opened),
    areaAssessed(assessed, "academic_practice", AREA_EVIDENCE),
    assessmentPublished(publishedAssessment),
    reviewOpened(openedReview),
    benefitClaimed(claimedReview, claimedBenefit),
    benefitObserved(observedReview, observedBenefit),
    reviewConcluded(concludeReview(observedReview, ACTOR)),
  ];

  const DECLARED = [
    SIGNAL_RAISED,
    SIGNAL_RESTATED,
    SIGNAL_CORROBORATED,
    SIGNAL_TRIAGED,
    SIGNAL_ACCEPTED,
    SIGNAL_MERGED,
    SIGNAL_DECLINED,
    INITIATIVE_PROPOSED,
    INITIATIVE_RESTATED,
    INITIATIVE_RECLASSIFIED,
    INITIATIVE_SUBMITTED,
    INITIATIVE_REVIEW_STARTED,
    INITIATIVE_APPROVED,
    INITIATIVE_REJECTED,
    INITIATIVE_PILOT_STARTED,
    INITIATIVE_ADOPTED,
    INITIATIVE_WITHDRAWN,
    GATE_CONVOKED,
    BALLOT_CAST,
    GATE_SATISFIED,
    GATE_REFUSED,
    LESSON_RECORDED,
    LESSON_REVISED,
    LESSON_RETAINED,
    LESSON_SUPERSEDED,
    CYCLE_OPENED,
    CYCLE_RESTATED,
    CYCLE_RESCHEDULED,
    CYCLE_EXECUTION_STARTED,
    CYCLE_REVIEW_STARTED,
    CYCLE_CLOSED,
    CYCLE_ABANDONED,
    ASSESSMENT_OPENED,
    AREA_ASSESSED,
    ASSESSMENT_PUBLISHED,
    REVIEW_OPENED,
    BENEFIT_CLAIMED,
    BENEFIT_OBSERVED,
    REVIEW_CONCLUDED,
  ];

  it("puts no free text on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const text of FREE_TEXT) {
      expect(wire).not.toContain(text);
    }
  });

  it("puts no person on the wire, on any event this module can produce", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const person of PEOPLE) {
      expect(wire).not.toContain(person);
    }
  });

  it("puts no raw benefit figure and no declared weight on the wire", () => {
    const wire = JSON.stringify(everyEvent().map((event) => event.payload));
    for (const figure of [...RAW_FIGURES, ...WEIGHT_FIGURES]) {
      expect(wire).not.toContain(figure);
    }
  });

  it("puts no area score on the wire, however the assessment is read", () => {
    for (const event of everyEvent()) {
      expect(event.payload).not.toHaveProperty("score");
      expect(event.payload).not.toHaveProperty("areaScores");
    }
  });

  it("scopes every event to the tenant it happened in", () => {
    for (const event of everyEvent()) {
      expect(event.metadata.tenantId).toBe(TENANT);
    }
  });

  it("names every event under the evolution namespace", () => {
    for (const event of everyEvent()) {
      expect(event.type).toMatch(/^evolution\.[a-z]+\.[a-z-]+$/);
    }
  });

  it("mints a distinct event id for every broadcast", () => {
    const events = everyEvent();
    const ids = new Set(events.map((event) => event.metadata.eventId));
    expect(ids.size).toBe(events.length);
  });

  it("produces every event this contract declares, and no other", () => {
    const produced = new Set(everyEvent().map((event) => event.type));
    expect(produced).toEqual(new Set(DECLARED));
    expect(DECLARED.length).toBe(new Set(DECLARED).size);
  });

  it("declares nothing that enacts, deploys or reverts anything", () => {
    for (const type of DECLARED) {
      expect(type).not.toMatch(/deploy|release|enact|rollback|apply|execute$/);
    }
  });
});
