import { createEvent } from "@knowget/events";
import type { DomainEvent, Uuid } from "@knowget/types";
import type { AdoptionReview, ReviewedBenefit } from "./adoption-review";
import { isReviewConcluded } from "./adoption-review";
import type {
  BenefitDirection,
  CapabilityArea,
  ChangeClass,
  CycleStage,
  GateOutcome,
  GovernanceGate,
  InitiativeStatus,
  LessonCategory,
  LessonOrigin,
  LessonRetention,
  MaturityLevel,
  RealizationVerdict,
  SignalPriority,
  SignalSource,
  SignalStatus,
  VarianceBand,
} from "./evolution-value";
import type { GovernanceDecision } from "./governance-decision";
import { decisionConditions } from "./governance-decision";
import type { ImprovementCycle } from "./improvement-cycle";
import { isCycleSettled } from "./improvement-cycle";
import type { ImprovementInitiative } from "./improvement-initiative";
import { isInitiativeAdopted, isInitiativeSettled } from "./improvement-initiative";
import type { ImprovementSignal } from "./improvement-signal";
import { isSignalSettled } from "./improvement-signal";
import type { Lesson } from "./lesson";
import { isLessonRetained } from "./lesson";
import type { MaturityAssessment } from "./maturity-assessment";
import { isAssessmentPublished } from "./maturity-assessment";

/**
 * Domain events for platform evolution, institutional learning and continuous improvement (P2-D30), on the
 * `evolution.*` namespace.
 *
 * Payloads carry ids, registry keys, vocabulary terms, statuses, gates, verdicts, bands, periods and counts.
 * Every piece of free text this domain holds stays in the domain: a signal's `summary` and `declineReason`, an
 * initiative's `summary` and `withdrawalReason`, a decision's `rationale` and its `conditions`, a lesson's
 * `statement`, a cycle's `intent` and `abandonmentReason`. So does every person — `raisedBy`, `triagedBy`,
 * `proposedBy`, every ballot's `decidedBy`, `openedBy`, `publishedBy`, `settledBy` and `concludedBy` are on the
 * record, not on the wire. A subscriber that genuinely needs to know who refused a gate reads it from the
 * decision id, within the tenant, deliberately.
 *
 * That exclusion is heavier here than anywhere else in the platform. This is the contract where an institution
 * writes down what it got wrong, and the record of who agreed to what. A broadcast channel carrying a lesson's
 * text is a broadcast channel carrying *the maths department did not act on the attendance data*, to every
 * subscriber that ever registered, forever. What routes is that a lesson was recorded, in which capability
 * areas, from which origin; who reads the sentence is an access-controlled question and stays one.
 *
 * Four exclusions are specific to this contract and each is load-bearing.
 *
 * **An unpublished maturity index never travels.** {@link MaturityAssessmentEventPayload.index} and
 * {@link MaturityAssessmentEventPayload.level} are `null` until the assessment is published, and the coverage
 * that decided publishability travels from the start. The domain already refuses to publish an index computed
 * from too little of the institution, on the grounds that the number reaches documents where nobody sees how
 * much of the institution it came from — and an event is precisely such a document. A draft index on a bus is
 * the failure the coverage floor exists to prevent, arriving by a route the floor does not cover.
 *
 * **A benefit's raw levels never travel.** A claim's baseline and target, and the figure later observed against
 * them, are readings on some other domain's scale; this contract cites that scale and never owns it. What
 * travels is this contract's own product — the fraction of the promised movement achieved, and the band it
 * falls in — which is what a subscriber reacting to a shortfall actually needs and is meaningless to
 * misinterpret. A subscriber holding the raw levels would be a second place the institution's attendance rate
 * lives, and the second copy is always the one that goes stale.
 *
 * **A weight set and an area breakdown never travel.** {@link areaAssessed} says which area was read and how
 * much evidence stood behind it, and never the score. What an institution rates itself at, area by area, is a
 * governance record read deliberately by somebody who will be asked to justify it; an event carrying the
 * breakdown would invite a subscriber to recompute the index, and a second implementation of the composite is
 * the fragmentation this platform exists to end.
 *
 * **Nothing here is a command.** Every event is the past tense of something a person did, including the two
 * that report arithmetic: {@link gateRefused} fires because a named person refused, and
 * {@link reviewConcluded} fires because a named person closed the review on a verdict the engine derived.
 * Program E's through-line is that AI recommends with evidence, humans approve, and nothing self-modifies or
 * self-deploys; a channel on which this domain could announce an intention rather than a fact is the first
 * place that line would fail, because a subscriber acting on the announcement would have enacted an
 * institutional change nobody approved.
 */

// --- Improvement signals ---------------------------------------------------------
export const SIGNAL_RAISED = "evolution.signal.raised";
export const SIGNAL_RESTATED = "evolution.signal.restated";
export const SIGNAL_CORROBORATED = "evolution.signal.corroborated";
export const SIGNAL_TRIAGED = "evolution.signal.triaged";
export const SIGNAL_ACCEPTED = "evolution.signal.accepted";
export const SIGNAL_MERGED = "evolution.signal.merged";
export const SIGNAL_DECLINED = "evolution.signal.declined";

export interface ImprovementSignalEventPayload {
  readonly signalId: Uuid;
  readonly organizationId: Uuid;
  readonly signalKey: string;
  /** Where the institution heard it. What a subscriber routes an ownership question to. */
  readonly source: SignalSource;
  readonly status: SignalStatus;
  readonly priority: SignalPriority;
  /** Distinct people behind it — the number that separates one complaint from a pattern. */
  readonly corroboration: number;
  /** Accounts that were second or later from someone already counted. Volume, not weight. */
  readonly repeatAccounts: number;
  /** Accounts with nobody's name on them. Held, and never allowed to raise the priority. */
  readonly unattributed: number;
  /** Whether the source carries the signal without anybody having to corroborate it. */
  readonly selfEvident: boolean;
  readonly citationCount: number;
  readonly settled: boolean;
  /** The signal this one was folded into, when that is how it was settled. */
  readonly mergedIntoSignalId: Uuid | null;
}

export type SignalRaisedEvent = DomainEvent<typeof SIGNAL_RAISED, ImprovementSignalEventPayload>;
export type SignalRestatedEvent = DomainEvent<
  typeof SIGNAL_RESTATED,
  ImprovementSignalEventPayload
>;
export type SignalCorroboratedEvent = DomainEvent<
  typeof SIGNAL_CORROBORATED,
  ImprovementSignalEventPayload
>;
export type SignalTriagedEvent = DomainEvent<typeof SIGNAL_TRIAGED, ImprovementSignalEventPayload>;
export type SignalAcceptedEvent = DomainEvent<
  typeof SIGNAL_ACCEPTED,
  ImprovementSignalEventPayload
>;
export type SignalMergedEvent = DomainEvent<typeof SIGNAL_MERGED, ImprovementSignalEventPayload>;
export type SignalDeclinedEvent = DomainEvent<
  typeof SIGNAL_DECLINED,
  ImprovementSignalEventPayload
>;

// The priority's four inputs travel alongside the priority itself, for the same reason the aggregate stores
// them: `elevated` is a claim about how many people independently said the same thing, and a subscriber that
// received only the word would have to take it on trust from a domain whose whole subject is not doing that.
const signalPayload = (signal: ImprovementSignal): ImprovementSignalEventPayload => ({
  signalId: signal.id,
  organizationId: signal.organizationId,
  signalKey: signal.signalKey,
  source: signal.source,
  status: signal.status,
  priority: signal.priority,
  corroboration: signal.corroboration,
  repeatAccounts: signal.repeatAccounts,
  unattributed: signal.unattributed,
  selfEvident: signal.selfEvident,
  citationCount: signal.citations.length,
  settled: isSignalSettled(signal),
  mergedIntoSignalId: signal.mergedIntoSignalId,
});

export const signalRaised = (signal: ImprovementSignal): SignalRaisedEvent =>
  createEvent(SIGNAL_RAISED, signalPayload(signal), { tenantId: signal.tenantId });
export const signalRestated = (signal: ImprovementSignal): SignalRestatedEvent =>
  createEvent(SIGNAL_RESTATED, signalPayload(signal), { tenantId: signal.tenantId });

/** Somebody else says the same thing. The only event here that can move a signal up the queue. */
export const signalCorroborated = (signal: ImprovementSignal): SignalCorroboratedEvent =>
  createEvent(SIGNAL_CORROBORATED, signalPayload(signal), { tenantId: signal.tenantId });
export const signalTriaged = (signal: ImprovementSignal): SignalTriagedEvent =>
  createEvent(SIGNAL_TRIAGED, signalPayload(signal), { tenantId: signal.tenantId });
export const signalAccepted = (signal: ImprovementSignal): SignalAcceptedEvent =>
  createEvent(SIGNAL_ACCEPTED, signalPayload(signal), { tenantId: signal.tenantId });
export const signalMerged = (signal: ImprovementSignal): SignalMergedEvent =>
  createEvent(SIGNAL_MERGED, signalPayload(signal), { tenantId: signal.tenantId });

/** The institution considered it and said no. The reason stays in the domain; the fact does not. */
export const signalDeclined = (signal: ImprovementSignal): SignalDeclinedEvent =>
  createEvent(SIGNAL_DECLINED, signalPayload(signal), { tenantId: signal.tenantId });

// --- Improvement initiatives -----------------------------------------------------
export const INITIATIVE_PROPOSED = "evolution.initiative.proposed";
export const INITIATIVE_RESTATED = "evolution.initiative.restated";
export const INITIATIVE_RECLASSIFIED = "evolution.initiative.reclassified";
export const INITIATIVE_SUBMITTED = "evolution.initiative.submitted";
export const INITIATIVE_REVIEW_STARTED = "evolution.initiative.review-started";
export const INITIATIVE_APPROVED = "evolution.initiative.approved";
export const INITIATIVE_REJECTED = "evolution.initiative.rejected";
export const INITIATIVE_PILOT_STARTED = "evolution.initiative.pilot-started";
export const INITIATIVE_ADOPTED = "evolution.initiative.adopted";
export const INITIATIVE_WITHDRAWN = "evolution.initiative.withdrawn";

export interface ImprovementInitiativeEventPayload {
  readonly initiativeId: Uuid;
  readonly organizationId: Uuid;
  readonly initiativeKey: string;
  /** How big a change the institution says this is — which is to say how many people have to agree to it. */
  readonly changeClass: ChangeClass;
  readonly status: InitiativeStatus;
  /** How many reported problems this change answers. Zero is legitimate and worth being able to see. */
  readonly originatingSignalCount: number;
  /** The period the pilot began in, or `null` if it has not. What a duration is counted from. */
  readonly pilotStartedPeriod: number | null;
  readonly settled: boolean;
  /** Whether this is now how the institution works. The one flag that changes what other domains should do. */
  readonly adopted: boolean;
}

export type InitiativeProposedEvent = DomainEvent<
  typeof INITIATIVE_PROPOSED,
  ImprovementInitiativeEventPayload
>;
export type InitiativeRestatedEvent = DomainEvent<
  typeof INITIATIVE_RESTATED,
  ImprovementInitiativeEventPayload
>;
export type InitiativeReclassifiedEvent = DomainEvent<
  typeof INITIATIVE_RECLASSIFIED,
  ImprovementInitiativeEventPayload
>;
export type InitiativeSubmittedEvent = DomainEvent<
  typeof INITIATIVE_SUBMITTED,
  ImprovementInitiativeEventPayload
>;
export type InitiativeReviewStartedEvent = DomainEvent<
  typeof INITIATIVE_REVIEW_STARTED,
  ImprovementInitiativeEventPayload
>;
export type InitiativeApprovedEvent = DomainEvent<
  typeof INITIATIVE_APPROVED,
  ImprovementInitiativeEventPayload
>;
export type InitiativeRejectedEvent = DomainEvent<
  typeof INITIATIVE_REJECTED,
  ImprovementInitiativeEventPayload
>;
export type InitiativePilotStartedEvent = DomainEvent<
  typeof INITIATIVE_PILOT_STARTED,
  ImprovementInitiativeEventPayload
>;
export type InitiativeAdoptedEvent = DomainEvent<
  typeof INITIATIVE_ADOPTED,
  ImprovementInitiativeEventPayload
>;
export type InitiativeWithdrawnEvent = DomainEvent<
  typeof INITIATIVE_WITHDRAWN,
  ImprovementInitiativeEventPayload
>;

// The originating signals travel as a count rather than as ids. A subscriber deciding whether to look at a
// change wants to know it answers something reported rather than something imagined; a subscriber that needs
// which reports has an initiative id and a repository, and asking through those keeps the signals' own
// visibility rules in force instead of copying them onto a bus that has none.
const initiativePayload = (
  initiative: ImprovementInitiative,
): ImprovementInitiativeEventPayload => ({
  initiativeId: initiative.id,
  organizationId: initiative.organizationId,
  initiativeKey: initiative.initiativeKey,
  changeClass: initiative.changeClass,
  status: initiative.status,
  originatingSignalCount: initiative.originatingSignalIds.length,
  pilotStartedPeriod: initiative.pilotStartedPeriod,
  settled: isInitiativeSettled(initiative),
  adopted: isInitiativeAdopted(initiative),
});

export const initiativeProposed = (initiative: ImprovementInitiative): InitiativeProposedEvent =>
  createEvent(INITIATIVE_PROPOSED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });
export const initiativeRestated = (initiative: ImprovementInitiative): InitiativeRestatedEvent =>
  createEvent(INITIATIVE_RESTATED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });

/** The change's class moved, which moves its quorum. Only possible before anybody has been asked. */
export const initiativeReclassified = (
  initiative: ImprovementInitiative,
): InitiativeReclassifiedEvent =>
  createEvent(INITIATIVE_RECLASSIFIED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });
export const initiativeSubmitted = (initiative: ImprovementInitiative): InitiativeSubmittedEvent =>
  createEvent(INITIATIVE_SUBMITTED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });
export const initiativeReviewStarted = (
  initiative: ImprovementInitiative,
): InitiativeReviewStartedEvent =>
  createEvent(INITIATIVE_REVIEW_STARTED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });
export const initiativeApproved = (initiative: ImprovementInitiative): InitiativeApprovedEvent =>
  createEvent(INITIATIVE_APPROVED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });
export const initiativeRejected = (initiative: ImprovementInitiative): InitiativeRejectedEvent =>
  createEvent(INITIATIVE_REJECTED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });

/** The change is being tried somewhere. Not yet how the institution works, and the difference is the point. */
export const initiativePilotStarted = (
  initiative: ImprovementInitiative,
): InitiativePilotStartedEvent =>
  createEvent(INITIATIVE_PILOT_STARTED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });

/**
 * This is now how the institution works.
 *
 * The most consequential event in the package, and still only a statement about a record. Nothing downstream is
 * expected to enact anything on receiving it: adoption means the institution agreed, and the work of actually
 * changing a timetable, a policy document or a process belongs to whoever owns those and to a person who
 * decided to do it. An event that were treated as an instruction would be this platform deploying its own
 * conclusions, which is the one thing Program E is built to make impossible.
 */
export const initiativeAdopted = (initiative: ImprovementInitiative): InitiativeAdoptedEvent =>
  createEvent(INITIATIVE_ADOPTED, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });

/** Taken off the table by the people proposing it, rather than refused by the people deciding. */
export const initiativeWithdrawn = (initiative: ImprovementInitiative): InitiativeWithdrawnEvent =>
  createEvent(INITIATIVE_WITHDRAWN, initiativePayload(initiative), {
    tenantId: initiative.tenantId,
  });

// --- Governance decisions --------------------------------------------------------
export const GATE_CONVOKED = "evolution.gate.convoked";
export const BALLOT_CAST = "evolution.gate.ballot-cast";
export const GATE_SATISFIED = "evolution.gate.satisfied";
export const GATE_REFUSED = "evolution.gate.refused";

export interface GovernanceDecisionEventPayload {
  readonly decisionId: Uuid;
  readonly organizationId: Uuid;
  readonly initiativeId: Uuid;
  readonly gate: GovernanceGate;
  readonly changeClass: ChangeClass;
  readonly outcome: GateOutcome;
  /** Distinct people who must agree. Never zero, whatever the change class. */
  readonly required: number;
  /** Countable agreements so far, plain and conditional together. */
  readonly affirmed: number;
  /** How many more are needed. What a chasing notification is built from. */
  readonly outstanding: number;
  /** Agreements that came with conditions attached. The conditions themselves stay in the domain. */
  readonly conditional: number;
  /** Whether somebody said no. One refusal settles the gate; a majority cannot outvote it. */
  readonly refused: boolean;
  /** People who were asked and declined to answer either way. Visible, and never counted as agreement. */
  readonly deferrals: number;
  /** Every ballot cast, including the ones the quorum rule could not count. */
  readonly ballotsCast: number;
  readonly conditionCount: number;
}

export type GateConvokedEvent = DomainEvent<typeof GATE_CONVOKED, GovernanceDecisionEventPayload>;
export type BallotCastEvent = DomainEvent<typeof BALLOT_CAST, GovernanceDecisionEventPayload>;
export type GateSatisfiedEvent = DomainEvent<typeof GATE_SATISFIED, GovernanceDecisionEventPayload>;
export type GateRefusedEvent = DomainEvent<typeof GATE_REFUSED, GovernanceDecisionEventPayload>;

// Every ballot's `decidedBy` is absent, and the count of conditions travels without their text. Both follow
// from the same fact: a gate is a minute, and a minute is read by people entitled to read it. What a
// subscriber can act on is that the institution is three agreements short of a decision — not who the three
// might be, and not what the two people who already agreed want changed first.
const decisionPayload = (decision: GovernanceDecision): GovernanceDecisionEventPayload => ({
  decisionId: decision.id,
  organizationId: decision.organizationId,
  initiativeId: decision.initiativeId,
  gate: decision.gate,
  changeClass: decision.changeClass,
  outcome: decision.outcome,
  required: decision.required,
  affirmed: decision.affirmed,
  outstanding: decision.outstanding,
  conditional: decision.conditional,
  refused: decision.refused,
  deferrals: decision.deferrals,
  ballotsCast: decision.ballots.length,
  conditionCount: decisionConditions(decision).length,
});

/** People have been asked. Until this fires, an initiative waiting on governance is waiting on nobody. */
export const gateConvoked = (decision: GovernanceDecision): GateConvokedEvent =>
  createEvent(GATE_CONVOKED, decisionPayload(decision), { tenantId: decision.tenantId });
export const ballotCast = (decision: GovernanceDecision): BallotCastEvent =>
  createEvent(BALLOT_CAST, decisionPayload(decision), { tenantId: decision.tenantId });

/** Enough distinct people, none of them the proposer, agreed. The change may move. */
export const gateSatisfied = (decision: GovernanceDecision): GateSatisfiedEvent =>
  createEvent(GATE_SATISFIED, decisionPayload(decision), { tenantId: decision.tenantId });

/**
 * Somebody said no, and that settles it.
 *
 * There is no counterpart event for a gate being reopened, because gates are not reopened. Reconsideration is a
 * new gate on the same initiative, which fires {@link gateConvoked} and leaves both rounds in the record — and
 * a subscriber that saw this event is entitled to keep believing the institution was warned.
 */
export const gateRefused = (decision: GovernanceDecision): GateRefusedEvent =>
  createEvent(GATE_REFUSED, decisionPayload(decision), { tenantId: decision.tenantId });

// --- Lessons ---------------------------------------------------------------------
export const LESSON_RECORDED = "evolution.lesson.recorded";
export const LESSON_REVISED = "evolution.lesson.revised";
export const LESSON_RETAINED = "evolution.lesson.retained";
export const LESSON_SUPERSEDED = "evolution.lesson.superseded";

export interface LessonEventPayload {
  readonly lessonId: Uuid;
  readonly organizationId: Uuid;
  readonly lessonKey: string;
  readonly category: LessonCategory;
  /** What produced it. A lesson comes from something that happened, never from a suggestion box. */
  readonly origin: LessonOrigin;
  /** The record it came out of, in that origin's own key space. */
  readonly originRef: string;
  readonly retention: LessonRetention;
  /** Which parts of the institution it bears on. Vocabulary terms, and the whole of what routes here. */
  readonly areas: readonly CapabilityArea[];
  /** The period it entered memory in, or `null` while it has not. */
  readonly retainedAtPeriod: number | null;
  /** Whether a commitment actually resolved. The difference between memory and a document. */
  readonly retained: boolean;
  /** The later lesson that replaced it, when one has. */
  readonly supersedingLessonKey: string | null;
}

export type LessonRecordedEvent = DomainEvent<typeof LESSON_RECORDED, LessonEventPayload>;
export type LessonRevisedEvent = DomainEvent<typeof LESSON_REVISED, LessonEventPayload>;
export type LessonRetainedEvent = DomainEvent<typeof LESSON_RETAINED, LessonEventPayload>;
export type LessonSupersededEvent = DomainEvent<typeof LESSON_SUPERSEDED, LessonEventPayload>;

// `statement` is absent and is the single most important omission in this file — see the module comment. The
// areas travel because they are a closed vocabulary and because they are how a subscriber decides whether this
// concerns it; the sentence travels nowhere, because deciding who reads what an institution admits about
// itself is an access-control question and a bus is not an access control.
const lessonPayload = (lesson: Lesson): LessonEventPayload => ({
  lessonId: lesson.id,
  organizationId: lesson.organizationId,
  lessonKey: lesson.lessonKey,
  category: lesson.category,
  origin: lesson.origin,
  originRef: lesson.originRef,
  retention: lesson.retention,
  areas: lesson.areas,
  retainedAtPeriod: lesson.retainedAtPeriod,
  retained: isLessonRetained(lesson),
  supersedingLessonKey: lesson.supersedingLessonKey,
});

/** Written down. Not yet remembered, and the two states are not the same thing. */
export const lessonRecorded = (lesson: Lesson): LessonRecordedEvent =>
  createEvent(LESSON_RECORDED, lessonPayload(lesson), { tenantId: lesson.tenantId });
export const lessonRevised = (lesson: Lesson): LessonRevisedEvent =>
  createEvent(LESSON_REVISED, lessonPayload(lesson), { tenantId: lesson.tenantId });

/**
 * A commitment resolved against the knowledge graph, and the lesson is now institutional memory.
 *
 * This is the event the contract's first clause exists for, and the one an institution should count. The gap
 * between how often {@link lessonRecorded} fires and how often this does is the honest measure of whether
 * anything is being learned, and it is uncomfortable everywhere, which is exactly why it is worth publishing.
 */
export const lessonRetained = (lesson: Lesson): LessonRetainedEvent =>
  createEvent(LESSON_RETAINED, lessonPayload(lesson), { tenantId: lesson.tenantId });

/** A later conclusion replaced it. Anything citing it needs to know, which is why this is an event. */
export const lessonSuperseded = (lesson: Lesson): LessonSupersededEvent =>
  createEvent(LESSON_SUPERSEDED, lessonPayload(lesson), { tenantId: lesson.tenantId });

// --- Improvement cycles ----------------------------------------------------------
export const CYCLE_OPENED = "evolution.cycle.opened";
export const CYCLE_RESTATED = "evolution.cycle.restated";
export const CYCLE_RESCHEDULED = "evolution.cycle.rescheduled";
export const CYCLE_EXECUTION_STARTED = "evolution.cycle.execution-started";
export const CYCLE_REVIEW_STARTED = "evolution.cycle.review-started";
export const CYCLE_CLOSED = "evolution.cycle.closed";
export const CYCLE_ABANDONED = "evolution.cycle.abandoned";

export interface ImprovementCycleEventPayload {
  readonly cycleId: Uuid;
  readonly organizationId: Uuid;
  readonly cycleKey: string;
  readonly stage: CycleStage;
  readonly startPeriod: number;
  readonly endPeriod: number;
  /** Whole periods the round committed to. What an overrun is measured against. */
  readonly periods: number;
  /** Lessons the round produced. Zero is why a cycle cannot close. */
  readonly lessonsRecorded: number;
  readonly settled: boolean;
}

export type CycleOpenedEvent = DomainEvent<typeof CYCLE_OPENED, ImprovementCycleEventPayload>;
export type CycleRestatedEvent = DomainEvent<typeof CYCLE_RESTATED, ImprovementCycleEventPayload>;
export type CycleRescheduledEvent = DomainEvent<
  typeof CYCLE_RESCHEDULED,
  ImprovementCycleEventPayload
>;
export type CycleExecutionStartedEvent = DomainEvent<
  typeof CYCLE_EXECUTION_STARTED,
  ImprovementCycleEventPayload
>;
export type CycleReviewStartedEvent = DomainEvent<
  typeof CYCLE_REVIEW_STARTED,
  ImprovementCycleEventPayload
>;
export type CycleClosedEvent = DomainEvent<typeof CYCLE_CLOSED, ImprovementCycleEventPayload>;
export type CycleAbandonedEvent = DomainEvent<typeof CYCLE_ABANDONED, ImprovementCycleEventPayload>;

// The span travels as both ends and a length, which is redundant on purpose: a subscriber deciding whether a
// round is late needs the end, and one reporting on how long institutions give themselves needs the length,
// and neither should have to know that this domain counts periods inclusively to get the other.
const cyclePayload = (cycle: ImprovementCycle): ImprovementCycleEventPayload => ({
  cycleId: cycle.id,
  organizationId: cycle.organizationId,
  cycleKey: cycle.cycleKey,
  stage: cycle.stage,
  startPeriod: cycle.startPeriod,
  endPeriod: cycle.endPeriod,
  periods: cycle.periods,
  lessonsRecorded: cycle.lessonsRecorded,
  settled: isCycleSettled(cycle),
});

export const cycleOpened = (cycle: ImprovementCycle): CycleOpenedEvent =>
  createEvent(CYCLE_OPENED, cyclePayload(cycle), { tenantId: cycle.tenantId });
export const cycleRestated = (cycle: ImprovementCycle): CycleRestatedEvent =>
  createEvent(CYCLE_RESTATED, cyclePayload(cycle), { tenantId: cycle.tenantId });

/** The round moved its own goalposts, before it started. Worth seeing for exactly that reason. */
export const cycleRescheduled = (cycle: ImprovementCycle): CycleRescheduledEvent =>
  createEvent(CYCLE_RESCHEDULED, cyclePayload(cycle), { tenantId: cycle.tenantId });
export const cycleExecutionStarted = (cycle: ImprovementCycle): CycleExecutionStartedEvent =>
  createEvent(CYCLE_EXECUTION_STARTED, cyclePayload(cycle), { tenantId: cycle.tenantId });
export const cycleReviewStarted = (cycle: ImprovementCycle): CycleReviewStartedEvent =>
  createEvent(CYCLE_REVIEW_STARTED, cyclePayload(cycle), { tenantId: cycle.tenantId });

/** Closed through the gate, with lessons. The only ending that reports as a completed improvement. */
export const cycleClosed = (cycle: ImprovementCycle): CycleClosedEvent =>
  createEvent(CYCLE_CLOSED, cyclePayload(cycle), { tenantId: cycle.tenantId });

/**
 * The round stopped without getting there.
 *
 * The honest ending, and the one worth broadcasting. An institution that only ever emitted
 * {@link cycleClosed} would publish a completion rate of one, and any subscriber building an improvement
 * dashboard from these events would faithfully reproduce it.
 */
export const cycleAbandoned = (cycle: ImprovementCycle): CycleAbandonedEvent =>
  createEvent(CYCLE_ABANDONED, cyclePayload(cycle), { tenantId: cycle.tenantId });

// --- Maturity assessments --------------------------------------------------------
export const ASSESSMENT_OPENED = "evolution.assessment.opened";
export const AREA_ASSESSED = "evolution.assessment.area-assessed";
export const ASSESSMENT_PUBLISHED = "evolution.assessment.published";

export interface MaturityAssessmentEventPayload {
  readonly assessmentId: Uuid;
  readonly organizationId: Uuid;
  readonly assessmentKey: string;
  readonly period: number;
  /** The weighted index, and `null` until the assessment is published. See the module comment. */
  readonly index: number | null;
  /** The band that index falls in, and `null` on the same terms. */
  readonly level: MaturityLevel | null;
  /** Weighted share of the institution actually read. Travels from the start, because it qualifies everything. */
  readonly coverage: number;
  readonly areasReported: number;
  /** Whether coverage clears the floor. A subscriber can see an assessment is stuck without seeing its number. */
  readonly publishable: boolean;
  readonly published: boolean;
}

export interface AreaAssessedEventPayload extends MaturityAssessmentEventPayload {
  /** Which capability area was read. */
  readonly area: CapabilityArea;
  /** How many records stood behind the reading. Zero is a judgement nobody has to defend. */
  readonly evidenceCount: number;
}

export type AssessmentOpenedEvent = DomainEvent<
  typeof ASSESSMENT_OPENED,
  MaturityAssessmentEventPayload
>;
export type AreaAssessedEvent = DomainEvent<typeof AREA_ASSESSED, AreaAssessedEventPayload>;
export type AssessmentPublishedEvent = DomainEvent<
  typeof ASSESSMENT_PUBLISHED,
  MaturityAssessmentEventPayload
>;

// The index is withheld until publication and the per-area scores are withheld always — see the module
// comment. Coverage travels throughout, because it is the fact that decides whether the number will ever be
// allowed out, and a subscriber watching an assessment stall at four areas of ten can say so without ever
// having been told what the institution rates itself at.
const assessmentPayload = (assessment: MaturityAssessment): MaturityAssessmentEventPayload => {
  const published = isAssessmentPublished(assessment);
  return {
    assessmentId: assessment.id,
    organizationId: assessment.organizationId,
    assessmentKey: assessment.assessmentKey,
    period: assessment.period,
    index: published ? assessment.index : null,
    level: published ? assessment.level : null,
    coverage: assessment.coverage,
    areasReported: assessment.areasReported,
    publishable: assessment.publishable,
    published,
  };
};

export const assessmentOpened = (assessment: MaturityAssessment): AssessmentOpenedEvent =>
  createEvent(ASSESSMENT_OPENED, assessmentPayload(assessment), {
    tenantId: assessment.tenantId,
  });

/** One area of the institution was read. The score stays in the domain; that it was read does not. */
export const areaAssessed = (
  assessment: MaturityAssessment,
  area: CapabilityArea,
  evidenceCount: number,
): AreaAssessedEvent =>
  createEvent(
    AREA_ASSESSED,
    { ...assessmentPayload(assessment), area, evidenceCount },
    { tenantId: assessment.tenantId },
  );

/**
 * The index is now what the institution says about itself, and only now does the number travel.
 *
 * Publication is the moment the coverage floor has been cleared and a person decided to stand behind the
 * result. Before it, the same arithmetic is a draft somebody is still assembling, and a draft that reached a
 * subscriber would be quoted as the institution's maturity by whatever built a report from these events.
 */
export const assessmentPublished = (assessment: MaturityAssessment): AssessmentPublishedEvent =>
  createEvent(ASSESSMENT_PUBLISHED, assessmentPayload(assessment), {
    tenantId: assessment.tenantId,
  });

// --- Adoption reviews ------------------------------------------------------------
export const REVIEW_OPENED = "evolution.review.opened";
export const BENEFIT_CLAIMED = "evolution.review.benefit-claimed";
export const BENEFIT_OBSERVED = "evolution.review.benefit-observed";
export const REVIEW_CONCLUDED = "evolution.review.concluded";

export interface AdoptionReviewEventPayload {
  readonly reviewId: Uuid;
  readonly organizationId: Uuid;
  readonly initiativeId: Uuid;
  /** How long after adoption the institution looked. Most of what a verdict means. */
  readonly reviewPeriod: number;
  readonly verdict: RealizationVerdict;
  /** The severest band any measured benefit landed in, and what decided the verdict. */
  readonly worstBand: VarianceBand | null;
  /** Benefits somebody actually went and looked at. */
  readonly benefitsMeasured: number;
  /** Benefits the change promised. The gap against `benefitsMeasured` is the review's own honesty. */
  readonly benefitsClaimed: number;
  readonly concluded: boolean;
}

export interface ReviewedBenefitEventPayload {
  readonly reviewId: Uuid;
  readonly organizationId: Uuid;
  readonly initiativeId: Uuid;
  readonly reviewPeriod: number;
  readonly measureKey: string;
  /** Which way the measure was supposed to move. Fixed at the claim, never inferred from the numbers. */
  readonly direction: BenefitDirection;
  /** Fraction of the promised movement achieved. `0` while unobserved, and negative if it went backwards. */
  readonly ratio: number;
  readonly band: VarianceBand | null;
  readonly observed: boolean;
}

export type ReviewOpenedEvent = DomainEvent<typeof REVIEW_OPENED, AdoptionReviewEventPayload>;
export type BenefitClaimedEvent = DomainEvent<typeof BENEFIT_CLAIMED, ReviewedBenefitEventPayload>;
export type BenefitObservedEvent = DomainEvent<
  typeof BENEFIT_OBSERVED,
  ReviewedBenefitEventPayload
>;
export type ReviewConcludedEvent = DomainEvent<typeof REVIEW_CONCLUDED, AdoptionReviewEventPayload>;

// The running verdict travels before the review concludes, unlike the maturity index, and the asymmetry is
// deliberate. An index is a bare number that reads as authoritative wherever it lands; a verdict arrives with
// the counts that qualify it, so a subscriber holding `revert` on two measured benefits of six can see for
// itself that the institution has not finished looking.
const reviewPayload = (review: AdoptionReview): AdoptionReviewEventPayload => ({
  reviewId: review.id,
  organizationId: review.organizationId,
  initiativeId: review.initiativeId,
  reviewPeriod: review.reviewPeriod,
  verdict: review.verdict,
  worstBand: review.worstBand,
  benefitsMeasured: review.benefitsMeasured,
  benefitsClaimed: review.benefitsClaimed,
  concluded: isReviewConcluded(review),
});

// The baseline, the target and the observation are all absent — see the module comment. The ratio is this
// contract's own product and carries the whole of what a subscriber can act on: whether the change delivered
// the movement it promised, as a fraction of that promise rather than as somebody else's units.
const benefitPayload = (
  review: AdoptionReview,
  benefit: ReviewedBenefit,
): ReviewedBenefitEventPayload => ({
  reviewId: review.id,
  organizationId: review.organizationId,
  initiativeId: review.initiativeId,
  reviewPeriod: review.reviewPeriod,
  measureKey: benefit.measureKey,
  direction: benefit.direction,
  ratio: benefit.ratio,
  band: benefit.band,
  observed: benefit.observed !== null,
});

export const reviewOpened = (review: AdoptionReview): ReviewOpenedEvent =>
  createEvent(REVIEW_OPENED, reviewPayload(review), { tenantId: review.tenantId });

/** The institution wrote down what the change was supposed to deliver, while it can still be missed. */
export const benefitClaimed = (
  review: AdoptionReview,
  benefit: ReviewedBenefit,
): BenefitClaimedEvent =>
  createEvent(BENEFIT_CLAIMED, benefitPayload(review, benefit), { tenantId: review.tenantId });

/** Somebody went and looked. The band is the answer; the figure it came from stays in the domain. */
export const benefitObserved = (
  review: AdoptionReview,
  benefit: ReviewedBenefit,
): BenefitObservedEvent =>
  createEvent(BENEFIT_OBSERVED, benefitPayload(review, benefit), { tenantId: review.tenantId });

/**
 * The review is closed and its verdict is the institution's answer about this change.
 *
 * A `revert` verdict is a finding and not an instruction, and no subscriber should treat it as one. Undoing an
 * adopted change is a new initiative under the reversion gate, proposed by a person and agreed by more than
 * one; a platform that could unwind its own decisions on the strength of arithmetic would be self-modifying,
 * which is the failure this contract, and the five before it, exist to prevent.
 */
export const reviewConcluded = (review: AdoptionReview): ReviewConcludedEvent =>
  createEvent(REVIEW_CONCLUDED, reviewPayload(review), { tenantId: review.tenantId });
