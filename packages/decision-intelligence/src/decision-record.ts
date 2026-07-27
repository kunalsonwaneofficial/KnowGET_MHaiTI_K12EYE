import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  AUTO_EXECUTION_RISK_CEILING,
  type AutonomyReason,
  type CompensationState,
  type DecisionDisposition,
  type ExecutionOutcome,
  type ImpactBand,
  type RiskLevel,
  isAutonomousDisposition,
  isWithinAutoExecutionRisk,
  riskRank,
} from "./decision-value";
import type { ActionView, DecisionSummaryView } from "./decision-view";
import {
  AnonymousDecisionError,
  AutonomousDecisionAboveCeilingError,
  AutonomousDecisionHasDeciderError,
  AutonomousDecisionOnHumanSubjectError,
  AutonomousDecisionWithoutEvidenceError,
  DecisionNotCompensatableError,
  ExecutionNotAuthorizedByDecisionError,
  InvalidExecutionTransitionError,
} from "./errors";
import type { Recommendation } from "./recommendation";
import { compensationStateFor, isCompensationOutstanding } from "./reversal";

/**
 * What was decided, by whom or by what, on what grounds — and what happened next.
 *
 * This is the institution's accountability record, and it is deliberately more than a status on the
 * recommendation it answers. A recommendation says what was advised; this says who took responsibility, what
 * they were actually looking at when they did, and whether the world was changed as a result. Those are
 * different facts with different lifetimes: the advice can be superseded, the accountability cannot.
 *
 * Every decision points at a recommendation — `recommendationId` is not nullable — which means every decision
 * points, through it, at a grounded evidence chain. There is no path here for an act to be taken and justified
 * afterwards. An automation firing that never produced a recommendation gets its own record (an automation run),
 * not a decision without grounds.
 *
 * The three rules of the contract reach the record itself rather than stopping at the gate that precedes them:
 *
 * - **Only low-risk actions auto-execute.** {@link recordDecision} refuses an `auto_executed` disposition whose
 *   risk — the worse of the recommendation's and the action's — sits above `AUTO_EXECUTION_RISK_CEILING`, and
 *   refuses one on a subject declared to require human judgement. The autonomy gate would never have produced
 *   such a decision; this makes it impossible to write one anyway, by a service that skipped the gate.
 * - **Recommendations ship with evidence.** An `auto_executed` decision must carry the evidence ids it rested
 *   on. A person may decide on grounds they are willing to own; the machine has only the chain.
 * - **Automation carries rollback.** `compensationState` is computed by the reversal engine from the action and
 *   how far execution got — never asserted — and {@link compensateDecision} refuses unless compensation was
 *   genuinely available, so a status update cannot stand in for the world being put back.
 *
 * What the decider was looking at is snapshotted (`confidenceAtDecision`, `riskLevelAtDecision`,
 * `impactBandAtDecision`, `evidenceIds`, `autonomyReasons`) rather than read back through the recommendation.
 * Evidence and confidence can move afterwards; an audit six months later must be able to ask what was in front
 * of the person at the time, not what the record says today.
 */

// --- The aggregate ---------------------------------------------------------------

export interface DecisionRecord {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The recommendation this answers. Never null — every decision has recorded grounds. */
  readonly recommendationId: Uuid;
  readonly disposition: DecisionDisposition;
  /** The person accountable. Null if and only if the disposition is `auto_executed`. */
  readonly decidedByUserId: string | null;
  readonly decidedAt: ISODateString;
  readonly decisionNote: string | null;
  /** The confidence of the evidence chain as it stood when the decision was taken. */
  readonly confidenceAtDecision: number;
  readonly riskLevelAtDecision: RiskLevel;
  readonly impactBandAtDecision: ImpactBand;
  /** The evidence the decision rested on, by id, as the chain stood at the time. */
  readonly evidenceIds: readonly string[];
  /** The autonomy gate's stable reason codes, as they were when the gate ran. */
  readonly autonomyReasons: readonly AutonomyReason[];
  /** What the decision authorizes. Null when it authorizes nothing — a judgement, not an act. */
  readonly action: ActionView | null;
  readonly executionOutcome: ExecutionOutcome;
  /** The runtime invocation or workflow instance this was carried out as. Null until requested. */
  readonly executionRef: string | null;
  readonly executionRequestedAt: ISODateString | null;
  readonly executionSettledAt: ISODateString | null;
  readonly executionError: string | null;
  /** Derived by the reversal engine from the action and the outcome. No caller can assert this. */
  readonly compensationState: CompensationState;
  readonly compensationRef: string | null;
  readonly compensatedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RecordDecisionParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly recommendationId: Uuid;
  readonly disposition: DecisionDisposition;
  readonly decidedByUserId?: string | null;
  readonly note?: string | null;
  readonly confidenceAtDecision: number;
  readonly riskLevelAtDecision: RiskLevel;
  readonly impactBandAtDecision: ImpactBand;
  readonly evidenceIds: readonly string[];
  readonly autonomyReasons?: readonly AutonomyReason[];
  readonly action?: ActionView | null;
  /** Declared on the recommendation. An auto-executed decision may not be taken on one. */
  readonly requiresHumanJudgement?: boolean;
}

/** What is supplied when a decision is taken on a recommendation already in hand. */
export type DecideOnRecommendationParams = Pick<
  RecordDecisionParams,
  "disposition" | "decidedByUserId" | "note" | "autonomyReasons" | "action"
>;

/** The worse of two risk levels — the one a ceiling has to be applied to. */
const worseRisk = (a: RiskLevel, b: RiskLevel): RiskLevel => (riskRank(b) > riskRank(a) ? b : a);

/** The risk an auto-execution ceiling must be applied to: the recommendation's, or the action's if worse. */
const decidedRisk = (riskLevelAtDecision: RiskLevel, action: ActionView | null): RiskLevel =>
  action === null ? riskLevelAtDecision : worseRisk(riskLevelAtDecision, action.riskLevel);

/**
 * Record a decision. The guards here are the contract's rules at the point of writing — see the module comment
 * for why each one refuses rather than warns.
 */
export function recordDecision(params: RecordDecisionParams): DecisionRecord {
  const decidedByUserId = params.decidedByUserId?.trim() || null;
  const action = params.action ?? null;

  if (isAutonomousDisposition(params.disposition)) {
    if (decidedByUserId !== null) {
      throw new AutonomousDecisionHasDeciderError(decidedByUserId);
    }
    if (params.evidenceIds.length === 0) {
      throw new AutonomousDecisionWithoutEvidenceError(params.recommendationId);
    }
    if (params.requiresHumanJudgement === true) {
      throw new AutonomousDecisionOnHumanSubjectError(params.recommendationId);
    }
    const risk = decidedRisk(params.riskLevelAtDecision, action);
    if (!isWithinAutoExecutionRisk(risk)) {
      throw new AutonomousDecisionAboveCeilingError(risk, AUTO_EXECUTION_RISK_CEILING);
    }
  } else if (decidedByUserId === null) {
    throw new AnonymousDecisionError(params.disposition);
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    recommendationId: params.recommendationId,
    disposition: params.disposition,
    decidedByUserId,
    decidedAt: now,
    decisionNote: params.note?.trim() || null,
    confidenceAtDecision: params.confidenceAtDecision,
    riskLevelAtDecision: params.riskLevelAtDecision,
    impactBandAtDecision: params.impactBandAtDecision,
    evidenceIds: [...params.evidenceIds],
    autonomyReasons: [...(params.autonomyReasons ?? [])],
    action,
    executionOutcome: "not_started",
    executionRef: null,
    executionRequestedAt: null,
    executionSettledAt: null,
    executionError: null,
    compensationState: "not_required",
    compensationRef: null,
    compensatedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Take a decision on a recommendation in hand, snapshotting what the decider was actually looking at straight
 * from it. This exists so that no caller ever assembles that snapshot by hand: a service that copied the
 * confidence but forgot the evidence ids, or read the risk from the action rather than the recommendation, would
 * produce a record that audits cleanly and describes something that never happened.
 */
export const decideOnRecommendation = (
  recommendation: Recommendation,
  params: DecideOnRecommendationParams,
): DecisionRecord =>
  recordDecision({
    ...params,
    tenantId: recommendation.tenantId,
    organizationId: recommendation.organizationId,
    recommendationId: recommendation.id,
    confidenceAtDecision: recommendation.confidence,
    riskLevelAtDecision: recommendation.riskLevel,
    impactBandAtDecision: recommendation.impactBand,
    evidenceIds: recommendation.evidence.map((piece) => piece.id),
    requiresHumanJudgement: recommendation.requiresHumanJudgement,
  });

const touch = (decision: DecisionRecord, patch: Partial<DecisionRecord>): DecisionRecord => ({
  ...decision,
  ...patch,
  updatedAt: nowIso(),
});

// --- Execution -------------------------------------------------------------------

/**
 * Whether the decision permits something to be carried out. A rejection and a deferral authorize nothing, and
 * saying so here keeps "a decision was taken" from being mistaken for "the act was permitted".
 */
export const authorizesExecution = (decision: DecisionRecord): boolean =>
  decision.disposition === "auto_executed" || decision.disposition === "approved";

/** The action a decision authorized, or a refusal. Every execution transition starts here. */
function requireAuthorizedAction(decision: DecisionRecord): ActionView {
  if (!authorizesExecution(decision) || decision.action === null) {
    throw new ExecutionNotAuthorizedByDecisionError(decision.id, decision.disposition);
  }
  return decision.action;
}

/** Move the execution on, recomputing where the decision stands on being undone as it goes. */
function advanceExecution(
  decision: DecisionRecord,
  from: ExecutionOutcome,
  to: ExecutionOutcome,
  patch: Partial<DecisionRecord>,
): DecisionRecord {
  const action = requireAuthorizedAction(decision);
  if (decision.executionOutcome !== from) {
    throw new InvalidExecutionTransitionError(decision.executionOutcome, to);
  }
  return touch(decision, {
    ...patch,
    executionOutcome: to,
    compensationState: compensationStateFor(action, to),
  });
}

/**
 * Ask the runtime to carry out what was decided. From this moment the decision may already owe a compensation —
 * a requested invocation whose result is unknown is treated as having reached the capability, because assuming
 * otherwise is how a half-completed action gets left in the institution with nobody watching it.
 */
export const requestExecution = (decision: DecisionRecord, executionRef: string): DecisionRecord =>
  advanceExecution(decision, "not_started", "requested", {
    executionRef: executionRef.trim() || null,
    executionRequestedAt: nowIso(),
  });

/** The runtime carried it out. */
export const completeExecution = (decision: DecisionRecord): DecisionRecord =>
  advanceExecution(decision, "requested", "succeeded", { executionSettledAt: nowIso() });

/**
 * The runtime could not carry it out. The compensation obligation does not go away with the failure: a failure
 * report says the call did not succeed, not that nothing changed.
 */
export const failExecution = (decision: DecisionRecord, error: string): DecisionRecord =>
  advanceExecution(decision, "requested", "failed", {
    executionSettledAt: nowIso(),
    executionError: error.trim() || null,
  });

/**
 * Record that what was done has been put back. Refused unless compensation was genuinely available — declared,
 * reachable and not already taken — so the record cannot claim a reversal that never happened.
 */
export function compensateDecision(
  decision: DecisionRecord,
  compensationRef: string,
): DecisionRecord {
  if (!isCompensationOutstanding(decision.compensationState)) {
    throw new DecisionNotCompensatableError(decision.id, decision.compensationState);
  }
  return touch(decision, {
    executionOutcome: "compensated",
    compensationState: "compensated",
    compensationRef: compensationRef.trim() || null,
    compensatedAt: nowIso(),
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the machine took this decision on its own. The number governance watches, one record at a time. */
export const isAutonomousDecision = (decision: DecisionRecord): boolean =>
  isAutonomousDisposition(decision.disposition);

/** Whether execution has finished moving, however it finished. */
export const isExecutionSettled = (decision: DecisionRecord): boolean =>
  decision.executionOutcome === "succeeded" ||
  decision.executionOutcome === "failed" ||
  decision.executionOutcome === "compensated";

/** Whether this decision still owes the institution a reversal. */
export const isCompensationDue = (decision: DecisionRecord): boolean =>
  isCompensationOutstanding(decision.compensationState);

/** The compensating capability that would undo this, when there is one. */
export const compensationCapabilityKey = (decision: DecisionRecord): string | null =>
  isCompensationDue(decision) ? (decision.action?.compensationKey ?? null) : null;

/** The metrics engine's view. */
export const toDecisionSummaryView = (decision: DecisionRecord): DecisionSummaryView => ({
  id: decision.id,
  disposition: decision.disposition,
  executionOutcome: decision.executionOutcome,
});
