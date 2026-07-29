import { describe, expect, it } from "vitest";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  type AdoptionReview,
  concludeReview,
  observeBenefit,
  openReview,
  recordBenefit,
} from "./adoption-review";
import { CAPABILITY_AREAS } from "./evolution-value";
import type { AreaWeight, EvidenceCitation } from "./evolution-view";
import { type GovernanceDecision, castBallot, convokeGate } from "./governance-decision";
import {
  type ImprovementCycle,
  abandonCycle,
  closeCycle,
  openCycle,
  startCycleExecution,
  startCycleReview,
} from "./improvement-cycle";
import {
  type ImprovementInitiative,
  adoptInitiative,
  approveInitiative,
  proposeInitiative,
  startInitiativePilot,
  startInitiativeReview,
  submitInitiative,
  withdrawInitiative,
} from "./improvement-initiative";
import {
  type ImprovementSignal,
  acceptSignal,
  declineSignal,
  mergeSignal,
  raiseSignal,
  triageSignal,
} from "./improvement-signal";
import { type Lesson, recordLesson, retainLesson, supersedeLesson } from "./lesson";
import {
  type MaturityAssessment,
  openAssessment,
  publishAssessment,
  recordAreaReading,
} from "./maturity-assessment";
import {
  InMemoryAdoptionReviewRepository,
  InMemoryGovernanceDecisionRepository,
  InMemoryImprovementCycleRepository,
  InMemoryImprovementInitiativeRepository,
  InMemoryImprovementSignalRepository,
  InMemoryLessonRepository,
  InMemoryMaturityAssessmentRepository,
} from "./ports";

const TENANT = "t1" as TenantId;
const OTHER = "t2" as TenantId;
const ORG = "org1" as Uuid;
const SIBLING = "org2" as Uuid;
const RAISER = "person-1" as Uuid;
const ACTOR = "person-9" as Uuid;
const INITIATIVE = "initiative-1" as Uuid;
const SIBLING_INITIATIVE = "initiative-2" as Uuid;

const SIGNAL_SUMMARY =
  "Marking turnaround in year nine has slipped past a fortnight since January.";
const INITIATIVE_SUMMARY =
  "Move year nine marking onto a two-week turnaround from the start of next term.";
const LESSON_STATEMENT =
  "Marking turnaround slips whenever a moderation window overlaps a reporting deadline.";
const CYCLE_INTENT =
  "Cut the gap between a marking concern being raised and something changing about it.";
const RATIONALE = "The two-week turnaround is achievable at the current marking load.";

const cite = (ref: string): EvidenceCitation => ({
  kind: "domain_record",
  sourceDomain: "assessment",
  sourceRef: ref,
  attestedBy: null,
});

const signal = (
  signalKey = "academic.marking-turnaround",
  tenantId: TenantId = TENANT,
  organizationId: Uuid = ORG,
): ImprovementSignal =>
  raiseSignal({
    tenantId,
    organizationId,
    signalKey,
    source: "stakeholder_feedback",
    summary: SIGNAL_SUMMARY,
    citations: [cite("rec-1")],
    raisedBy: RAISER,
  });

const initiative = (
  initiativeKey = "academic.marking-turnaround",
  tenantId: TenantId = TENANT,
  organizationId: Uuid = ORG,
): ImprovementInitiative =>
  proposeInitiative({
    tenantId,
    organizationId,
    initiativeKey,
    changeClass: "process",
    summary: INITIATIVE_SUMMARY,
    originatingSignalIds: [],
    proposedBy: RAISER,
  });

/** The period the fixture pilots start in. Adoption needs at least one whole period after it. */
const PILOT_START = 4;

const adopted = (
  initiativeKey = "academic.marking-turnaround",
  tenantId: TenantId = TENANT,
  organizationId: Uuid = ORG,
): ImprovementInitiative =>
  adoptInitiative(
    startInitiativePilot(
      approveInitiative(
        startInitiativeReview(
          submitInitiative(initiative(initiativeKey, tenantId, organizationId)),
        ),
        "satisfied",
      ),
      PILOT_START,
    ),
    "satisfied",
    PILOT_START + 1,
    ACTOR,
  );

const gate = (
  gateKind: "approval" | "pilot_exit" | "reversion" | "cycle_closure" = "approval",
  initiativeId: Uuid = INITIATIVE,
  tenantId: TenantId = TENANT,
): GovernanceDecision =>
  convokeGate({
    tenantId,
    organizationId: ORG,
    initiativeId,
    gate: gateKind,
    changeClass: "policy",
    proposedBy: RAISER,
    convokedBy: ACTOR,
  });

const cast = (decision: GovernanceDecision, deciderId: string): GovernanceDecision =>
  castBallot(decision, {
    deciderId: deciderId as Uuid,
    verdict: "approved",
    rationale: RATIONALE,
    conditions: [],
  });

/** A policy change needs two people, so this is the smallest settled gate the fixtures can produce. */
const settledGate = (
  gateKind: "approval" | "pilot_exit" | "reversion" | "cycle_closure" = "approval",
  initiativeId: Uuid = INITIATIVE,
): GovernanceDecision => cast(cast(gate(gateKind, initiativeId), "person-3"), "person-4");

const lesson = (
  lessonKey = "academic.marking-turnaround",
  tenantId: TenantId = TENANT,
  organizationId: Uuid = ORG,
  originRef = "cycle-2026-t1",
): Lesson =>
  recordLesson({
    tenantId,
    organizationId,
    lessonKey,
    statement: LESSON_STATEMENT,
    category: "process",
    origin: "cycle_retrospective",
    originRef,
    applicability: ["academic_practice"],
    recordedBy: RAISER,
  });

const cycle = (
  cycleKey = "academic.autumn-improvement",
  startPeriod = 4,
  tenantId: TenantId = TENANT,
  organizationId: Uuid = ORG,
): ImprovementCycle =>
  openCycle({
    tenantId,
    organizationId,
    cycleKey,
    intent: CYCLE_INTENT,
    startPeriod,
    endPeriod: startPeriod + 3,
    openedBy: RAISER,
  });

/** Ten areas at a tenth each. Seven of them scored clears the coverage floor exactly. */
const EVEN_WEIGHTS: readonly AreaWeight[] = CAPABILITY_AREAS.map((area) => ({ area, weight: 0.1 }));

const assessment = (
  assessmentKey = "annual.self-assessment",
  period = 3,
  tenantId: TenantId = TENANT,
  organizationId: Uuid = ORG,
): MaturityAssessment =>
  openAssessment({
    tenantId,
    organizationId,
    assessmentKey,
    period,
    weights: EVEN_WEIGHTS,
    openedBy: RAISER,
  });

/** Seven of ten areas scored with evidence, which is the least that can be published. */
const published = (
  assessmentKey = "annual.self-assessment",
  period = 3,
  tenantId: TenantId = TENANT,
  organizationId: Uuid = ORG,
): MaturityAssessment =>
  publishAssessment(
    CAPABILITY_AREAS.slice(0, 7).reduce<MaturityAssessment>(
      (open, area) => recordAreaReading(open, { area, score: 4, evidenceCount: 2 }),
      assessment(assessmentKey, period, tenantId, organizationId),
    ),
    ACTOR,
  );

const review = (
  reviewPeriod = 3,
  initiativeId: Uuid = INITIATIVE,
  tenantId: TenantId = TENANT,
  organizationId: Uuid = ORG,
): AdoptionReview =>
  openReview({ tenantId, organizationId, initiativeId, reviewPeriod, openedBy: RAISER });

const MEASURE = "attendance.persistent-absence-followup";

const claimed = (reviewPeriod = 3, initiativeId: Uuid = INITIATIVE): AdoptionReview =>
  recordBenefit(review(reviewPeriod, initiativeId), {
    measureKey: MEASURE,
    direction: "increase",
    baseline: 60,
    target: 80,
  });

describe("improvement signal storage", () => {
  it("returns nothing for another tenant's signal", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    const mine = signal();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds a signal by the key the institution argues about it through", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    await repository.save(signal());

    expect((await repository.findByKey(TENANT, "academic.marking-turnaround"))?.signalKey).toBe(
      "academic.marking-turnaround",
    );
    expect(await repository.findByKey(TENANT, "academic.moderation")).toBeNull();
    expect(await repository.findByKey(OTHER, "academic.marking-turnaround")).toBeNull();
  });

  it("keeps a settled signal's key taken, which is how recurrence is noticed", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    const triaged = triageSignal(signal(), ACTOR);
    await repository.save(declineSignal(triaged, ACTOR, "The timetable already answers this."));

    const still = await repository.findByKey(TENANT, "academic.marking-turnaround");
    expect(still?.status).toBe("declined");
    expect(still?.declineReason).toBe("The timetable already answers this.");
  });

  it("holds a triaged signal in the queue, because somebody still owes it an answer", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    await repository.save(triageSignal(signal(), ACTOR));

    const queue = await repository.listOpen(TENANT, ORG);
    expect(queue.map((entry) => entry.status)).toEqual(["triaged"]);
  });

  it("takes an accepted, merged or declined signal out of the queue", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    const other = signal("academic.moderation-window");
    await repository.save(acceptSignal(triageSignal(signal(), ACTOR), ACTOR));
    await repository.save(mergeSignal(triageSignal(other, ACTOR), signal().id as Uuid, ACTOR));
    await repository.save(
      declineSignal(
        triageSignal(signal("academic.report-deadlines"), ACTOR),
        ACTOR,
        "Out of scope this year.",
      ),
    );

    expect(await repository.listOpen(TENANT, ORG)).toEqual([]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(3);
  });

  it("keeps one organization's queue out of another's", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    await repository.save(signal());
    await repository.save(signal("estates.heating", TENANT, SIBLING));

    expect(await repository.listOpen(TENANT, ORG)).toHaveLength(1);
    expect(await repository.listOpen(TENANT, SIBLING)).toHaveLength(1);
  });

  it("replaces a signal in place rather than accumulating versions of it", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    const raised = signal();
    await repository.save(raised);
    await repository.save(triageSignal(raised, ACTOR));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect((await repository.findById(TENANT, raised.id))?.status).toBe("triaged");
  });

  it("lists a tenant's signals and nobody else's", async () => {
    const repository = new InMemoryImprovementSignalRepository();
    await repository.save(signal());
    await repository.save(signal("academic.marking-turnaround", OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("improvement initiative storage", () => {
  it("returns nothing for another tenant's initiative", async () => {
    const repository = new InMemoryImprovementInitiativeRepository();
    const mine = initiative();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds an initiative by the key its governance record cites", async () => {
    const repository = new InMemoryImprovementInitiativeRepository();
    await repository.save(initiative());

    expect((await repository.findByKey(TENANT, "academic.marking-turnaround"))?.initiativeKey).toBe(
      "academic.marking-turnaround",
    );
    expect(await repository.findByKey(OTHER, "academic.marking-turnaround")).toBeNull();
  });

  it("counts everything still in flight as open, however far along it is", async () => {
    const repository = new InMemoryImprovementInitiativeRepository();
    await repository.save(initiative());
    await repository.save(submitInitiative(initiative("academic.moderation-window")));
    await repository.save(
      startInitiativeReview(submitInitiative(initiative("academic.report-deadlines"))),
    );

    expect(await repository.listOpen(TENANT, ORG)).toHaveLength(3);
  });

  it("separates what the institution changed from what it merely considered", async () => {
    const repository = new InMemoryImprovementInitiativeRepository();
    await repository.save(adopted());
    await repository.save(
      withdrawInitiative(initiative("academic.moderation-window"), ACTOR, "Overtaken by events."),
    );

    const changed = await repository.listAdopted(TENANT, ORG);
    expect(changed.map((entry) => entry.initiativeKey)).toEqual(["academic.marking-turnaround"]);
    expect(await repository.listOpen(TENANT, ORG)).toEqual([]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });

  it("keeps a withdrawn proposal readable with the reason it was dropped", async () => {
    const repository = new InMemoryImprovementInitiativeRepository();
    const proposed = initiative();
    await repository.save(withdrawInitiative(proposed, ACTOR, "Overtaken by events."));

    const still = await repository.findById(TENANT, proposed.id);
    expect(still?.status).toBe("withdrawn");
    expect(still?.withdrawalReason).toBe("Overtaken by events.");
  });

  it("keeps one organization's changes out of another's", async () => {
    const repository = new InMemoryImprovementInitiativeRepository();
    await repository.save(adopted());
    await repository.save(adopted("estates.heating", TENANT, SIBLING));

    expect(await repository.listAdopted(TENANT, ORG)).toHaveLength(1);
    expect(await repository.listAdopted(TENANT, SIBLING)).toHaveLength(1);
  });

  it("replaces an initiative in place as it moves through its lifecycle", async () => {
    const repository = new InMemoryImprovementInitiativeRepository();
    const proposed = initiative();
    await repository.save(proposed);
    await repository.save(submitInitiative(proposed));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect((await repository.findById(TENANT, proposed.id))?.status).toBe("submitted");
  });

  it("lists a tenant's initiatives and nobody else's", async () => {
    const repository = new InMemoryImprovementInitiativeRepository();
    await repository.save(initiative());
    await repository.save(initiative("academic.marking-turnaround", OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("governance decision storage", () => {
  it("returns nothing for another tenant's decision", async () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    const mine = gate();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds the open gate an initiative is waiting on", async () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    const convoked = gate();
    await repository.save(convoked);

    expect((await repository.findOpenGate(TENANT, INITIATIVE, "approval"))?.id).toBe(convoked.id);
    expect(await repository.findOpenGate(OTHER, INITIATIVE, "approval")).toBeNull();
  });

  it("stops finding a gate once it is settled, so a second one may be convened", async () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    await repository.save(settledGate());

    expect(await repository.findOpenGate(TENANT, INITIATIVE, "approval")).toBeNull();
  });

  it("treats two kinds of gate on one change as the independent questions they are", async () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    await repository.save(gate("approval"));
    await repository.save(gate("pilot_exit"));

    expect((await repository.findOpenGate(TENANT, INITIATIVE, "approval"))?.gate).toBe("approval");
    expect((await repository.findOpenGate(TENANT, INITIATIVE, "pilot_exit"))?.gate).toBe(
      "pilot_exit",
    );
    expect(await repository.findOpenGate(TENANT, INITIATIVE, "reversion")).toBeNull();
  });

  it("returns one change's decision trail in the order the gates were convened", async () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    const first = settledGate("approval");
    const second = {
      ...gate("pilot_exit"),
      convokedAt: "2026-09-01T09:00:00.000Z" as ISODateString,
    };
    await repository.save(second);
    await repository.save({ ...first, convokedAt: "2026-08-01T09:00:00.000Z" as ISODateString });
    await repository.save(gate("approval", SIBLING_INITIATIVE));

    const trail = await repository.listByInitiative(TENANT, INITIATIVE);
    expect(trail.map((entry) => entry.gate)).toEqual(["approval", "pilot_exit"]);
  });

  it("keeps a refused gate in the trail, because a third-attempt approval is a different fact", async () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    const refused = castBallot(gate(), {
      deciderId: "person-3" as Uuid,
      verdict: "rejected",
      rationale: RATIONALE,
      conditions: [],
    });
    await repository.save(refused);

    expect((await repository.findById(TENANT, refused.id))?.outcome).toBe("refused");
    expect(await repository.listByInitiative(TENANT, INITIATIVE)).toHaveLength(1);
  });

  it("replaces a decision in place as ballots arrive", async () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    const convoked = gate();
    await repository.save(convoked);
    await repository.save(cast(convoked, "person-3"));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect((await repository.findById(TENANT, convoked.id))?.affirmed).toBe(1);
  });

  it("lists a tenant's decisions and nobody else's", async () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    await repository.save(gate());
    await repository.save(gate("approval", INITIATIVE, OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("lesson storage", () => {
  it("returns nothing for another tenant's lesson", async () => {
    const repository = new InMemoryLessonRepository();
    const mine = lesson();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds a lesson by the key its successor names it with", async () => {
    const repository = new InMemoryLessonRepository();
    await repository.save(lesson());

    expect((await repository.findByKey(TENANT, "academic.marking-turnaround"))?.lessonKey).toBe(
      "academic.marking-turnaround",
    );
    expect(await repository.findByKey(OTHER, "academic.marking-turnaround")).toBeNull();
  });

  it("reads back everything one retrospective taught the institution", async () => {
    const repository = new InMemoryLessonRepository();
    await repository.save(lesson());
    await repository.save(lesson("academic.moderation-window"));
    await repository.save(lesson("estates.heating", TENANT, ORG, "cycle-2026-t2"));

    const produced = await repository.listByOrigin(TENANT, "cycle_retrospective", "cycle-2026-t1");
    expect(produced).toHaveLength(2);
    expect(await repository.listByOrigin(TENANT, "incident_review", "cycle-2026-t1")).toEqual([]);
    expect(await repository.listByOrigin(OTHER, "cycle_retrospective", "cycle-2026-t1")).toEqual(
      [],
    );
  });

  it("counts only what reached memory as retained, not what was merely written down", async () => {
    const repository = new InMemoryLessonRepository();
    await repository.save(retainLesson(lesson(), true, 4));
    await repository.save(lesson("academic.moderation-window"));

    const memory = await repository.listRetained(TENANT, ORG);
    expect(memory.map((entry) => entry.lessonKey)).toEqual(["academic.marking-turnaround"]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });

  it("takes a superseded lesson back out of memory and leaves it readable", async () => {
    const repository = new InMemoryLessonRepository();
    const retained = retainLesson(lesson(), true, 4);
    await repository.save(supersedeLesson(retained, "academic.marking-window"));

    expect(await repository.listRetained(TENANT, ORG)).toEqual([]);
    const still = await repository.findById(TENANT, retained.id);
    expect(still?.retention).toBe("superseded");
    expect(still?.supersedingLessonKey).toBe("academic.marking-window");
  });

  it("keeps one organization's memory out of another's", async () => {
    const repository = new InMemoryLessonRepository();
    await repository.save(retainLesson(lesson(), true, 4));
    await repository.save(retainLesson(lesson("estates.heating", TENANT, SIBLING), true, 4));

    expect(await repository.listRetained(TENANT, ORG)).toHaveLength(1);
    expect(await repository.listRetained(TENANT, SIBLING)).toHaveLength(1);
  });

  it("lists a tenant's lessons and nobody else's", async () => {
    const repository = new InMemoryLessonRepository();
    await repository.save(lesson());
    await repository.save(lesson("academic.marking-turnaround", OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("improvement cycle storage", () => {
  it("returns nothing for another tenant's cycle", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    const mine = cycle();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds a cycle by the key its lessons cite as their origin", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    await repository.save(cycle());

    expect((await repository.findByKey(TENANT, "academic.autumn-improvement"))?.cycleKey).toBe(
      "academic.autumn-improvement",
    );
    expect(await repository.findByKey(OTHER, "academic.autumn-improvement")).toBeNull();
  });

  it("counts a round as running at every stage before an ending", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    await repository.save(cycle());
    await repository.save(startCycleExecution(cycle("academic.spring-improvement", 8)));
    await repository.save(
      startCycleReview(startCycleExecution(cycle("academic.summer-improvement", 12))),
    );

    const running = await repository.listOpen(TENANT, ORG);
    expect(running.map((entry) => entry.stage)).toEqual(["planning", "executing", "reviewing"]);
  });

  it("orders the running rounds by the period they set out from", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    await repository.save(cycle("academic.summer-improvement", 12));
    await repository.save(cycle("academic.autumn-improvement", 4));
    await repository.save(cycle("academic.spring-improvement", 8));

    const running = await repository.listOpen(TENANT, ORG);
    expect(running.map((entry) => entry.startPeriod)).toEqual([4, 8, 12]);
  });

  it("keeps an abandoned round out of the running list and in the record", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    const dropped = abandonCycle(
      startCycleExecution(cycle()),
      ACTOR,
      "The head of department left mid-term.",
    );
    await repository.save(dropped);
    await repository.save(
      closeCycle(
        startCycleReview(startCycleExecution(cycle("academic.spring-improvement", 8))),
        "satisfied",
        3,
        ACTOR,
      ),
    );

    expect(await repository.listOpen(TENANT, ORG)).toEqual([]);
    const still = await repository.findById(TENANT, dropped.id);
    expect(still?.stage).toBe("abandoned");
    expect(still?.abandonmentReason).toBe("The head of department left mid-term.");
  });

  it("keeps one organization's rounds out of another's", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    await repository.save(cycle());
    await repository.save(cycle("estates.autumn-improvement", 4, TENANT, SIBLING));

    expect(await repository.listOpen(TENANT, ORG)).toHaveLength(1);
    expect(await repository.listOpen(TENANT, SIBLING)).toHaveLength(1);
  });

  it("replaces a cycle in place as it moves through its stages", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    const opened = cycle();
    await repository.save(opened);
    await repository.save(startCycleExecution(opened));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect((await repository.findById(TENANT, opened.id))?.stage).toBe("executing");
  });

  it("lists a tenant's cycles and nobody else's", async () => {
    const repository = new InMemoryImprovementCycleRepository();
    await repository.save(cycle());
    await repository.save(cycle("academic.autumn-improvement", 4, OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("maturity assessment storage", () => {
  it("returns nothing for another tenant's assessment", async () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    const mine = assessment();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds an assessment by the key the institution files it under", async () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    await repository.save(assessment());

    expect((await repository.findByKey(TENANT, "annual.self-assessment"))?.assessmentKey).toBe(
      "annual.self-assessment",
    );
    expect(await repository.findByKey(OTHER, "annual.self-assessment")).toBeNull();
  });

  it("keeps a draft index out of the trend line, however far along it is", async () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    await repository.save(published());
    await repository.save(assessment("annual.mid-year", 4));

    const trend = await repository.listPublished(TENANT, ORG);
    expect(trend.map((entry) => entry.assessmentKey)).toEqual(["annual.self-assessment"]);
    expect(await repository.listByTenant(TENANT)).toHaveLength(2);
  });

  it("returns the trend in period order, because one index on its own decides nothing", async () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    await repository.save(published("annual.2028", 9));
    await repository.save(published("annual.2026", 3));
    await repository.save(published("annual.2027", 6));

    const trend = await repository.listPublished(TENANT, ORG);
    expect(trend.map((entry) => entry.period)).toEqual([3, 6, 9]);
  });

  it("keeps one organization's trend out of another's", async () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    await repository.save(published());
    await repository.save(published("annual.self-assessment", 3, TENANT, SIBLING));

    expect(await repository.listPublished(TENANT, ORG)).toHaveLength(1);
    expect(await repository.listPublished(TENANT, SIBLING)).toHaveLength(1);
  });

  it("replaces an assessment in place as areas are read into it", async () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    const opened = assessment();
    await repository.save(opened);
    await repository.save(
      recordAreaReading(opened, { area: "academic_practice", score: 4, evidenceCount: 2 }),
    );

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect((await repository.findById(TENANT, opened.id))?.areasReported).toBe(1);
  });

  it("lists a tenant's assessments and nobody else's", async () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    await repository.save(assessment());
    await repository.save(assessment("annual.self-assessment", 3, OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("adoption review storage", () => {
  it("returns nothing for another tenant's review", async () => {
    const repository = new InMemoryAdoptionReviewRepository();
    const mine = review();
    await repository.save(mine);

    expect(await repository.findById(TENANT, mine.id)).toEqual(mine);
    expect(await repository.findById(OTHER, mine.id)).toBeNull();
  });

  it("finds the review a change already had at a given distance from adoption", async () => {
    const repository = new InMemoryAdoptionReviewRepository();
    await repository.save(review(3));

    expect((await repository.findByInitiativeAndPeriod(TENANT, INITIATIVE, 3))?.reviewPeriod).toBe(
      3,
    );
    expect(await repository.findByInitiativeAndPeriod(TENANT, INITIATIVE, 4)).toBeNull();
    expect(await repository.findByInitiativeAndPeriod(OTHER, INITIATIVE, 3)).toBeNull();
  });

  it("does not confuse two changes reviewed at the same period", async () => {
    const repository = new InMemoryAdoptionReviewRepository();
    await repository.save(review(3, INITIATIVE));
    await repository.save(review(3, SIBLING_INITIATIVE));

    expect((await repository.findByInitiativeAndPeriod(TENANT, INITIATIVE, 3))?.initiativeId).toBe(
      INITIATIVE,
    );
    expect(
      (await repository.findByInitiativeAndPeriod(TENANT, SIBLING_INITIATIVE, 3))?.initiativeId,
    ).toBe(SIBLING_INITIATIVE);
  });

  it("returns one change's realization trail in period order", async () => {
    const repository = new InMemoryAdoptionReviewRepository();
    await repository.save(review(9));
    await repository.save(review(1));
    await repository.save(review(4));
    await repository.save(review(1, SIBLING_INITIATIVE));

    const trail = await repository.listByInitiative(TENANT, INITIATIVE);
    expect(trail.map((entry) => entry.reviewPeriod)).toEqual([1, 4, 9]);
  });

  it("keeps a concluded review readable with the verdict it reached", async () => {
    const repository = new InMemoryAdoptionReviewRepository();
    const concluded = concludeReview(observeBenefit(claimed(), MEASURE, 82), ACTOR);
    await repository.save(concluded);

    const still = await repository.findById(TENANT, concluded.id);
    expect(still?.verdict).toBe("sustained");
    expect(still?.concludedBy).toBe(ACTOR);
  });

  it("replaces a review in place as benefits are claimed and observed", async () => {
    const repository = new InMemoryAdoptionReviewRepository();
    const opened = review();
    await repository.save(opened);
    await repository.save(
      recordBenefit(opened, {
        measureKey: MEASURE,
        direction: "increase",
        baseline: 60,
        target: 80,
      }),
    );

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect((await repository.findById(TENANT, opened.id))?.benefitsClaimed).toBe(1);
  });

  it("lists a tenant's reviews and nobody else's", async () => {
    const repository = new InMemoryAdoptionReviewRepository();
    await repository.save(review());
    await repository.save(review(3, INITIATIVE, OTHER));

    expect(await repository.listByTenant(TENANT)).toHaveLength(1);
    expect(await repository.listByTenant(OTHER)).toHaveLength(1);
  });
});

describe("what no repository in this contract offers", () => {
  const repositories = [
    new InMemoryImprovementSignalRepository(),
    new InMemoryImprovementInitiativeRepository(),
    new InMemoryGovernanceDecisionRepository(),
    new InMemoryLessonRepository(),
    new InMemoryImprovementCycleRepository(),
    new InMemoryMaturityAssessmentRepository(),
    new InMemoryAdoptionReviewRepository(),
  ];

  it("gives nobody a way to delete a signal, a minute, a lesson or a verdict", () => {
    for (const repository of repositories) {
      expect(repository).not.toHaveProperty("remove");
      expect(Object.getPrototypeOf(repository)).not.toHaveProperty("remove");
    }
  });

  it("offers no read that would let a decision be quietly retried", () => {
    const repository = new InMemoryGovernanceDecisionRepository();
    for (const forbidden of ["reopen", "retry", "supersede", "listRefused"]) {
      expect(repository).not.toHaveProperty(forbidden);
      expect(Object.getPrototypeOf(repository)).not.toHaveProperty(forbidden);
    }
  });

  it("offers no browsable list of everything the institution ever turned down", () => {
    const repository = new InMemoryImprovementSignalRepository();
    expect(repository).not.toHaveProperty("listDeclined");
    expect(Object.getPrototypeOf(repository)).not.toHaveProperty("listDeclined");
  });

  it("offers no read that would invent one assessment per period", () => {
    const repository = new InMemoryMaturityAssessmentRepository();
    expect(repository).not.toHaveProperty("findByPeriod");
    expect(Object.getPrototypeOf(repository)).not.toHaveProperty("findByPeriod");
  });
});
