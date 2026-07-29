import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const finite = z.number().finite();

/**
 * A reporting period, and the one primitive worth spelling out. Periods are ordinals on a grid the institution
 * declares — not dates — because nothing in this domain holds a calendar: a pilot's length, a lesson's review
 * date and the distance between two maturity indices are all subtraction between two integers. A date arriving
 * here would have to be interpreted onto that grid, and interpreting it is a reporting decision this layer has
 * no standing to make. Negative ordinals are admissible, because an institution numbering backwards from an
 * established origin is ordinary.
 */
const periodIndex = z.number().int();

// --- Shared primitives -----------------------------------------------------------

const evidenceKind = z.enum([
  "domain_record",
  "attention_item",
  "decision_record",
  "forecast_run",
  "assessment_result",
  "audit_finding",
  "knowledge_assertion",
  "attested_return",
]);
const signalSource = z.enum([
  "stakeholder_feedback",
  "incident",
  "audit_finding",
  "attention_item",
  "decision_outcome",
  "forecast_variance",
  "adoption_review",
  "operational_review",
]);
const changeClass = z.enum(["clarification", "process", "policy", "structural"]);
const governanceGate = z.enum(["approval", "pilot_exit", "reversion", "cycle_closure"]);
const decisionVerdict = z.enum(["approved", "approved_with_conditions", "rejected", "deferred"]);
const lessonCategory = z.enum([
  "practice",
  "process",
  "policy",
  "capability",
  "risk",
  "stakeholder",
]);
const lessonOrigin = z.enum([
  "initiative_outcome",
  "adoption_review",
  "cycle_retrospective",
  "incident_review",
  "decision_review",
]);
const benefitDirection = z.enum(["increase", "decrease"]);

/**
 * One piece of evidence, carried whole. The kind names which store the reference belongs to and the pair after
 * it is how that store is asked, so a citation is validated here for shape and resolved at the composition root
 * against the record it claims — the two halves of refusing to let a strongly held opinion acquire a footnote.
 *
 * `attestedBy` is nullable because most kinds point at a record that speaks for itself. It is compulsory on an
 * `attested_return`, and the domain is what enforces that: an attested return is a judgement rather than a
 * record, so it is admissible only when somebody has put their name to it.
 */
const evidenceCitation = z.object({
  kind: evidenceKind,
  sourceDomain: nonEmpty,
  sourceRef: nonEmpty,
  attestedBy: z.string().nullable().optional(),
});

/**
 * What the institution says matters, declared before anything is scored. The area is a free string rather than
 * the closed vocabulary because the maturity engine resolves and canonicalizes names, and an unrecognised area
 * is dropped rather than fatal — a rule this layer would break by rejecting the request outright.
 */
const areaWeight = z.object({ area: nonEmpty, weight: finite });

// --- Improvement signals (evolution:contribute / evolution:manage) ---------------

/**
 * Something the institution has been told. The person raising it is taken from the principal rather than from
 * the body: the domain permits an unattributed raising for automated intake, but a caller who authenticated and
 * then named nobody is not anonymous — the platform knows exactly who filed it — and recording that as
 * unattributed would put a false number into the one count that measures whether people feel safe speaking up.
 */
export const raiseSignalSchema = z.object({
  organizationId: uuid,
  signalKey: nonEmpty,
  source: signalSource,
  summary: nonEmpty,
  citations: z.array(evidenceCitation),
});

export const restateSignalSchema = z.object({ summary: nonEmpty });

/**
 * A second account of the same problem. Only the source travels in the body — the account holder is the
 * principal, for the reason the corroboration count exists: it counts *distinct people*, and a body-supplied
 * name would let one caller raise a signal's standing by filing accounts under colleagues' names.
 */
export const corroborateSignalSchema = z.object({ source: signalSource });

export const mergeSignalSchema = z.object({ mergedIntoSignalId: uuid });

export const declineSignalSchema = z.object({ reason: nonEmpty });

// --- Improvement initiatives (evolution:contribute / evolution:govern) -----------

export const proposeInitiativeSchema = z.object({
  organizationId: uuid,
  initiativeKey: nonEmpty,
  changeClass,
  summary: nonEmpty,
  originatingSignalIds: z.array(uuid),
});

export const restateInitiativeSchema = z.object({ summary: nonEmpty });

export const reclassifyInitiativeSchema = z.object({ changeClass });

export const startPilotSchema = z.object({ startPeriod: periodIndex });

export const adoptInitiativeSchema = z.object({ asOfPeriod: periodIndex });

export const withdrawInitiativeSchema = z.object({ reason: nonEmpty });

// --- Governance decisions (evolution:govern) -------------------------------------

/**
 * Open a gate in front of a change. The declared class is carried because the domain's parameters ask for it,
 * and for the three initiative gates the service overrides it with the subject's own frozen class — so what a
 * caller sends there cannot lower the quorum. At `cycle_closure` there is no subject class to inherit and the
 * declared one stands, bounded by the decider floor and the proposer-may-not-decide rule.
 */
export const convokeGateSchema = z.object({
  organizationId: uuid,
  initiativeId: uuid,
  gate: governanceGate,
  changeClass,
  proposedBy: uuid,
});

/**
 * One person's decision. The decider is the principal and is deliberately not a field: a gate clears when a
 * required number of *distinct named people* have agreed, so a body-supplied decider would let a single caller
 * clear a three-decider gate by naming two colleagues — and the person directory cannot catch it, because the
 * colleagues are real. Conditions are compulsory on a conditional approval and refused everywhere else, which
 * the aggregate enforces rather than this schema, so the caller is told which rule they broke.
 */
export const castBallotSchema = z.object({
  verdict: decisionVerdict,
  rationale: nonEmpty,
  conditions: z.array(nonEmpty),
});

// --- Lessons (evolution:contribute / evolution:manage) ---------------------------

/**
 * What the institution concluded, and what produced it. `applicability` is free strings rather than the closed
 * capability vocabulary because the learning engine resolves them and drops what it does not recognise; a
 * schema that rejected an unknown area would turn a soft rule into a hard one at the edge.
 */
export const recordLessonSchema = z.object({
  organizationId: uuid,
  lessonKey: nonEmpty,
  statement: nonEmpty,
  category: lessonCategory,
  origin: lessonOrigin,
  originRef: nonEmpty,
  applicability: z.array(nonEmpty),
});

export const reviseLessonSchema = z.object({
  statement: nonEmpty,
  applicability: z.array(nonEmpty),
});

export const retainLessonSchema = z.object({ atPeriod: periodIndex });

export const supersedeLessonSchema = z.object({ supersedingLessonKey: nonEmpty });

// --- Improvement cycles (evolution:manage) ---------------------------------------

export const openCycleSchema = z.object({
  organizationId: uuid,
  cycleKey: nonEmpty,
  intent: nonEmpty,
  startPeriod: periodIndex,
  endPeriod: periodIndex,
});

export const restateCycleSchema = z.object({ intent: nonEmpty });

export const rescheduleCycleSchema = z.object({
  startPeriod: periodIndex,
  endPeriod: periodIndex,
});

export const abandonCycleSchema = z.object({ reason: nonEmpty });

// --- Maturity assessments (evolution:assess) -------------------------------------

/**
 * Open an assessment against a declared weighting. The weights arrive whole and are fixed from here, which is
 * the point of taking them at opening: a weighting editable after the readings landed would let a
 * disappointing index be improved by discovering that the weak areas were never important.
 */
export const openAssessmentSchema = z.object({
  organizationId: uuid,
  assessmentKey: nonEmpty,
  period: periodIndex,
  weights: z.array(areaWeight),
});

/** One area reading. Zero evidence is recordable and does not count toward coverage — the domain's rule. */
export const assessAreaSchema = z.object({
  area: nonEmpty,
  score: finite,
  evidenceCount: z.number().int().min(0),
});

// --- Adoption reviews (evolution:manage) -----------------------------------------

export const openReviewSchema = z.object({
  organizationId: uuid,
  initiativeId: uuid,
  reviewPeriod: periodIndex,
});

/** A benefit the change promised, stated before it is measured — which is what makes the measurement a test. */
export const claimBenefitSchema = z.object({
  measureKey: nonEmpty,
  direction: benefitDirection,
  baseline: finite,
  target: finite,
});

export const observeBenefitSchema = z.object({
  measureKey: nonEmpty,
  observed: finite,
});
