import { z } from "zod";

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
const nullableText = z.string().nullable();
const isoDate = z.string().datetime();

const riskLevel = z.enum(["low", "medium", "high", "critical"]);
const impactBand = z.enum(["individual", "cohort", "department", "institution"]);
const reversibility = z.enum(["reversible", "compensatable", "irreversible"]);
const autonomyMode = z.enum(["propose_only", "auto_with_approval", "auto_execute"]);
const evidenceSource = z.enum(["knowledge_graph", "reasoning_session"]);
const evidenceStrength = z.enum(["weak", "moderate", "strong"]);
const decisionDisposition = z.enum(["auto_executed", "approved", "rejected", "deferred"]);
const workflowTrigger = z.enum(["manual", "signal", "automation"]);
const stageKind = z.enum(["human_task", "decision", "automated_action", "notification"]);
const actionKind = z.enum(["invoke_capability", "start_workflow", "raise_recommendation"]);
const conditionOperator = z.enum([
  "equals",
  "not_equals",
  "greater_than",
  "less_than",
  "in",
  "not_in",
  "exists",
]);

/**
 * What a rule requests when it fires. Never a script and never a payload — a kind, what it acts on, how risky
 * and reversible the institution considers it, and the capability that would put it back. The autonomy gate
 * reads exactly these fields, so this is the whole surface over which "only low-risk actions auto-execute" is
 * decided.
 */
const action = z.object({
  kind: actionKind,
  targetKey: nullableText.optional(),
  riskLevel,
  reversibility,
  compensationKey: nullableText.optional(),
});

/** One action as the wire carries it, before the domain declares it. */
export type ActionInput = z.infer<typeof action>;

const condition = z.object({
  key: nonEmpty,
  operator: conditionOperator,
  values: z.array(z.string()).optional(),
});

/** One condition as the wire carries it, before the domain normalizes it and checks its arity. */
export type ConditionInput = z.infer<typeof condition>;

/**
 * The facts a signal carried. Open-ended by necessity — the keys are whatever the emitting domain observes —
 * but only the ones a rule's conditions actually name are kept on the run it produces, so an over-generous
 * caller cannot turn the audit record into a copy of some other domain's row.
 */
const facts = z.record(z.unknown());

// --- Recommendations (decision:operate / decision:decide) --------------------------

/**
 * A root citation: something the recommendation rests on directly. `supports` is deliberately absent here and
 * present on {@link citeEvidenceSchema} below, because a chain's internal wiring names evidence *by id* and the
 * ids of a chain being minted in this very request do not exist yet. A caller building a layered chain over
 * HTTP raises on its roots and then cites what rests on them, using the ids the raise returned — which is one
 * more call and no guessing, rather than an index-into-the-array convention that only this endpoint would use.
 */
const rootCitation = z.object({
  source: evidenceSource,
  ref: nonEmpty,
  strength: evidenceStrength,
  note: nullableText.optional(),
});

export const raiseRecommendationSchema = z.object({
  organizationId: uuid,
  title: nonEmpty,
  summary: nullableText.optional(),
  subjectDomain: nonEmpty,
  subjectId: nonEmpty,
  impactBand,
  riskLevel,
  requiresHumanJudgement: z.boolean().optional(),
  evidence: z.array(rootCitation).min(1),
  expiresAt: isoDate.nullable().optional(),
});

export const citeEvidenceSchema = z.object({
  source: evidenceSource,
  ref: nonEmpty,
  strength: evidenceStrength,
  supports: z.array(nonEmpty).optional(),
  note: nullableText.optional(),
});

/** An answer carries a note and nothing else — the person answering is the principal, never the body. */
export const resolveRecommendationSchema = z.object({ note: nullableText.optional() });

export const supersedeRecommendationSchema = z.object({ successorId: uuid });

/** The instant a sweep or a ranking is evaluated against, supplied so a screen and a test agree. */
export const asOfSchema = z.object({ at: isoDate.optional() });

// --- Decisions (decision:decide / decision:operate) --------------------------------

/**
 * What a decision adds to the recommendation it is taken on. Risk, impact, confidence and the evidence ids are
 * *not* here: they are snapshotted from the recommendation by the domain, because a decision that let its
 * caller restate the grounds it was taken on would record the caller's account of the past rather than the
 * institution's.
 */
export const decideSchema = z.object({
  disposition: decisionDisposition,
  note: nullableText.optional(),
  action: action.nullable().optional(),
});

export const executionRefSchema = z.object({ executionRef: nonEmpty });
export const executionErrorSchema = z.object({ error: nonEmpty });
export const compensationRefSchema = z.object({ compensationRef: nonEmpty });

// --- Workflow definitions (decision:manage) ----------------------------------------

const stage = z.object({
  key: nonEmpty,
  name: nonEmpty,
  ordinal: z.number().int(),
  kind: stageKind,
  capabilityKey: nullableText.optional(),
  riskLevel,
  reversibility,
  compensationKey: nullableText.optional(),
  dependsOn: z.array(nonEmpty).optional(),
  slaHours: z.number().int().positive().nullable().optional(),
  assigneeRole: nullableText.optional(),
  optional: z.boolean().optional(),
});

export const draftWorkflowSchema = z.object({
  organizationId: uuid,
  key: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  trigger: workflowTrigger,
  triggerSignalKey: nullableText.optional(),
  version: z.number().int().positive().optional(),
  stages: z.array(stage).optional(),
});

export const amendWorkflowSchema = z.object({
  name: nonEmpty.optional(),
  description: nullableText.optional(),
  trigger: workflowTrigger.optional(),
  triggerSignalKey: nullableText.optional(),
});

export const addStageSchema = stage;
export const replaceStagesSchema = z.object({ stages: z.array(stage) });

/** One stage as the wire carries it, before the domain mints it. Shared by the two endpoints that accept one. */
export type StageInput = z.infer<typeof stage>;

// --- Workflow instances (decision:operate) -----------------------------------------

export const startInstanceSchema = z.object({
  workflowKey: nonEmpty,
  subjectDomain: nonEmpty,
  subjectId: nonEmpty,
  triggeredByRuleId: uuid.nullable().optional(),
  recommendationId: uuid.nullable().optional(),
});

export const beginStageSchema = z.object({ assignedToUserId: nullableText.optional() });
export const completeStageSchema = z.object({
  note: nullableText.optional(),
  executionRef: nullableText.optional(),
});
export const skipStageSchema = z.object({ note: nullableText.optional() });
export const failStageSchema = z.object({
  error: nonEmpty,
  executionRef: nullableText.optional(),
});
export const cancelInstanceSchema = z.object({ reason: nullableText.optional() });

// --- Automation rules (decision:manage) --------------------------------------------

export const draftRuleSchema = z.object({
  organizationId: uuid,
  key: nonEmpty,
  name: nonEmpty,
  description: nullableText.optional(),
  signalKey: nonEmpty,
  conditions: z.array(condition).optional(),
  action,
  autonomyMode,
});

export const amendRuleSchema = z.object({
  name: nonEmpty.optional(),
  description: nullableText.optional(),
  signalKey: nonEmpty.optional(),
  conditions: z.array(condition).optional(),
  action: action.optional(),
  autonomyMode: autonomyMode.optional(),
});

export const addConditionSchema = condition;

/** What a dry run asks: would a signal carrying these facts fire anything? The signal key is in the path. */
export const matchingRulesSchema = z.object({ facts: facts.optional() });

// --- Automation runs (decision:operate / decision:decide) --------------------------

/**
 * What a firing carries. Used for both firing one named rule and dispatching a signal to whatever is listening —
 * in each case what is being fired is named in the path, so the body is only ever the subject and the facts.
 */
export const fireRuleSchema = z.object({
  subjectDomain: nonEmpty,
  subjectId: nonEmpty,
  facts: facts.optional(),
  recommendationId: uuid.nullable().optional(),
});

/** Approving and refusing carry a reason and nothing else — the decider is the principal. */
export const approveRunSchema = z.object({ note: nullableText.optional() });
export const rejectRunSchema = z.object({ reason: nullableText.optional() });
export const completeRunSchema = z.object({ executionRef: nullableText.optional() });
