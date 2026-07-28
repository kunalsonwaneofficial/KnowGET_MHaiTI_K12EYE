import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { AutomationRule, ObservedFact, SignalFacts } from "./automation-rule";
import { isRuleActive, observeFacts, toAutomationRuleView } from "./automation-rule";
import { classifyAction, classifyRecommendedAction } from "./autonomy";
import {
  type AutonomyDisposition,
  type AutonomyMode,
  type AutonomyReason,
  type CompensationState,
  type RunStatus,
  isBlockingAutonomyReason,
  isSettledRunStatus,
  normalizeSignalKey,
  normalizeSourceDomain,
} from "./decision-value";
import type {
  ActionView,
  AutonomyDecision,
  RecommendationGateView,
  RunSummaryView,
} from "./decision-view";
import {
  AnonymousRunApprovalError,
  EmptyRunSubjectError,
  InvalidRunTransitionError,
  RuleNotActiveError,
  RunNotAuthorizedError,
  RunNotCompensatableError,
} from "./errors";
import { compensationStateFor, isCompensationOutstanding } from "./reversal";

/**
 * One firing of an automation rule — what the institution's unattended surface actually did, one act at a time.
 *
 * A run exists **because** the autonomy gate ran, not before it. {@link fireRule} classifies the rule first and
 * creates the record already carrying the verdict, so there is no moment in the lifecycle at which a firing
 * exists without a recorded decision about how far it may go. The status it is born in *is* the verdict:
 * `blocked` when the gate refused outright, `awaiting_approval` when it referred the act to a person, `gated`
 * when it opened with nobody involved.
 *
 * The three rules of the contract are all enforced here at the record, not only at the gate that precedes it:
 *
 * - **Only low-risk actions auto-execute.** {@link beginRunExecution} refuses on a blocked disposition and on an
 *   approval-gated one that has not actually been approved — so a service that skipped the gate, or read it and
 *   went ahead anyway, still cannot write an execution the gate did not authorize. `blocked` is unreachable from
 *   `gated`, and `gated` is reachable only at creation with an `auto_execute` verdict or through
 *   {@link approveRun}, which names a person.
 * - **Recommendations ship with evidence.** When a firing acts on a recommendation, the gate used is the
 *   recommendation-aware one, so an ungrounded or already-answered recommendation blocks the run rather than
 *   producing one that quietly proceeds.
 * - **Automation carries rollback.** `compensationState` is computed by the reversal engine at every execution
 *   transition — never asserted by a caller — and {@link compensateRun} refuses unless compensation was
 *   genuinely available. A *failed* run still owes a rollback, because a failure report says the call did not
 *   succeed, not that nothing changed.
 *
 * `disposition`, `reasons`, `action` and `observedFacts` are all snapshots taken at the moment of firing. The
 * rule can be amended, paused or retired afterwards; what the institution needs to be able to answer is what
 * this firing was permitted to do at the time, on what it was looking at.
 */

// --- The aggregate ---------------------------------------------------------------

export interface AutomationRun {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly ruleId: Uuid;
  readonly ruleKey: string;
  readonly signalKey: string;
  readonly subjectDomain: string;
  readonly subjectId: string;
  /** The recommendation this firing acted on, when it acted on one. */
  readonly recommendationId: Uuid | null;
  /** The rule's action as it stood when this fired. */
  readonly action: ActionView;
  readonly autonomyMode: AutonomyMode;
  /** The gate's verdict, taken before this record existed. */
  readonly disposition: AutonomyDisposition;
  readonly reasons: readonly AutonomyReason[];
  /** The operands of the comparisons the rule made, as they stood. */
  readonly observedFacts: readonly ObservedFact[];
  readonly status: RunStatus;
  readonly approvedByUserId: string | null;
  readonly approvedAt: ISODateString | null;
  readonly approvalNote: string | null;
  readonly rejectedByUserId: string | null;
  readonly rejectedAt: ISODateString | null;
  readonly rejectionReason: string | null;
  /** The runtime invocation, workflow instance or recommendation this firing became. */
  readonly executionRef: string | null;
  readonly executionRequestedAt: ISODateString | null;
  readonly executionError: string | null;
  /** Derived by the reversal engine from the action and how far execution got. No caller can assert this. */
  readonly compensationState: CompensationState;
  readonly compensationRef: string | null;
  readonly compensatedAt: ISODateString | null;
  readonly firedAt: ISODateString;
  readonly settledAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface FireRuleParams {
  readonly subjectDomain: string;
  readonly subjectId: string;
  /** The facts the signal carried. Only the ones this rule examines are kept. */
  readonly facts?: SignalFacts;
  /** The recommendation being acted on, when there is one — gates the firing on its evidence too. */
  readonly recommendation?: RecommendationGateView | null;
}

/** The status a verdict is born in. There is no other way into any of the three. */
const initialStatus = (disposition: AutonomyDisposition): RunStatus =>
  disposition === "blocked"
    ? "blocked"
    : disposition === "requires_approval"
      ? "awaiting_approval"
      : "gated";

/**
 * Fire a rule: run the gate, then record what it said. Refused on a rule that is not active, because a draft,
 * paused or retired rule firing at all is the one thing its status is supposed to prevent.
 */
export function fireRule(rule: AutomationRule, params: FireRuleParams): AutomationRun {
  if (!isRuleActive(rule)) {
    throw new RuleNotActiveError(rule.id, rule.status);
  }

  const subjectDomain = normalizeSourceDomain(params.subjectDomain);
  const subjectId = params.subjectId.trim();
  if (subjectDomain.length === 0 || subjectId.length === 0) {
    throw new EmptyRunSubjectError();
  }

  const recommendation = params.recommendation ?? null;
  const decision: AutonomyDecision =
    recommendation === null
      ? classifyAction(toAutomationRuleView(rule))
      : classifyRecommendedAction(toAutomationRuleView(rule), recommendation);

  const timestamp = nowIso();
  const status = initialStatus(decision.disposition);

  return {
    id: newUuid(),
    tenantId: rule.tenantId,
    organizationId: rule.organizationId,
    ruleId: rule.id,
    ruleKey: rule.key,
    signalKey: rule.signalKey,
    subjectDomain,
    subjectId,
    recommendationId: recommendation === null ? null : (recommendation.id as Uuid),
    action: rule.action,
    autonomyMode: rule.autonomyMode,
    disposition: decision.disposition,
    reasons: [...decision.reasons],
    observedFacts: observeFacts(rule, params.facts ?? {}),
    status,
    approvedByUserId: null,
    approvedAt: null,
    approvalNote: null,
    rejectedByUserId: null,
    rejectedAt: null,
    rejectionReason: null,
    executionRef: null,
    executionRequestedAt: null,
    executionError: null,
    compensationState: compensationStateFor(rule.action, "not_started"),
    compensationRef: null,
    compensatedAt: null,
    firedAt: timestamp,
    settledAt: status === "blocked" ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const touch = (run: AutomationRun, patch: Partial<AutomationRun>): AutomationRun => ({
  ...run,
  ...patch,
  updatedAt: nowIso(),
});

/** Every transition passes through here, so no path can move a run out of a status it is not in. */
function requireStatus(run: AutomationRun, from: RunStatus, to: RunStatus): void {
  if (run.status !== from) {
    throw new InvalidRunTransitionError(run.status, to);
  }
}

// --- The human gate --------------------------------------------------------------

export interface ApproveRunParams {
  readonly approvedByUserId: string;
  readonly note?: string | null;
}

/**
 * A person opens the gate. This is the only way an approval-gated firing becomes executable, and it records who
 * opened it — the whole point of the gate is that somebody owns the act on the other side of it.
 */
export function approveRun(run: AutomationRun, params: ApproveRunParams): AutomationRun {
  requireStatus(run, "awaiting_approval", "gated");

  const approvedByUserId = params.approvedByUserId.trim();
  if (approvedByUserId.length === 0) {
    throw new AnonymousRunApprovalError("approved");
  }

  return touch(run, {
    status: "gated",
    approvedByUserId,
    approvedAt: nowIso(),
    approvalNote: params.note?.trim() || null,
  });
}

export interface RejectRunParams {
  readonly rejectedByUserId: string;
  readonly reason?: string | null;
}

/** A person declines. The firing settles without ever having been executable. */
export function rejectRun(run: AutomationRun, params: RejectRunParams): AutomationRun {
  requireStatus(run, "awaiting_approval", "blocked");

  const rejectedByUserId = params.rejectedByUserId.trim();
  if (rejectedByUserId.length === 0) {
    throw new AnonymousRunApprovalError("rejected");
  }

  const timestamp = nowIso();
  return touch(run, {
    status: "blocked",
    rejectedByUserId,
    rejectedAt: timestamp,
    rejectionReason: params.reason?.trim() || null,
    settledAt: timestamp,
  });
}

// --- Execution -------------------------------------------------------------------

/**
 * Whether the gate authorized this firing to be carried out at all. A blocked verdict never is; a referred one
 * is only once a person has actually approved it.
 */
export const isRunAuthorized = (run: AutomationRun): boolean =>
  run.disposition === "auto_execute" ||
  (run.disposition === "requires_approval" && run.approvedByUserId !== null);

/**
 * Ask the runtime to carry the action out. From this moment the run may already owe a compensation: a requested
 * invocation whose result is unknown is treated as having reached the capability, because assuming otherwise is
 * how a half-completed action gets left in the institution with nobody watching it.
 */
export function beginRunExecution(run: AutomationRun, executionRef: string): AutomationRun {
  requireStatus(run, "gated", "executing");
  if (!isRunAuthorized(run)) {
    throw new RunNotAuthorizedError(run.id, run.disposition);
  }

  return touch(run, {
    status: "executing",
    executionRef: executionRef.trim() || null,
    executionRequestedAt: nowIso(),
    compensationState: compensationStateFor(run.action, "requested"),
  });
}

export interface CompleteRunParams {
  /** The invocation, instance or recommendation the action became, if it is only known now. */
  readonly executionRef?: string | null;
}

/** The action was carried out. */
export function completeRun(run: AutomationRun, params: CompleteRunParams = {}): AutomationRun {
  requireStatus(run, "executing", "succeeded");

  const executionRef = params.executionRef?.trim() || null;
  return touch(run, {
    status: "succeeded",
    executionRef: executionRef ?? run.executionRef,
    settledAt: nowIso(),
    compensationState: compensationStateFor(run.action, "succeeded"),
  });
}

/**
 * The action could not be carried out. The compensation obligation survives the failure, for the reason in the
 * module comment.
 */
export function failRun(run: AutomationRun, error: string): AutomationRun {
  requireStatus(run, "executing", "failed");

  return touch(run, {
    status: "failed",
    executionError: error.trim() || null,
    settledAt: nowIso(),
    compensationState: compensationStateFor(run.action, "failed"),
  });
}

/**
 * Record that what this firing did has been put back. Deliberately not gated on the run still being unsettled —
 * a *failed* run is exactly the case rule three exists for, and refusing to compensate it because it had already
 * finished failing would be the obligation quietly dropped at the moment it matters most.
 */
export function compensateRun(run: AutomationRun, compensationRef: string): AutomationRun {
  if (!isCompensationOutstanding(run.compensationState)) {
    throw new RunNotCompensatableError(run.id, run.compensationState);
  }

  return touch(run, {
    status: "compensated",
    compensationState: "compensated",
    compensationRef: compensationRef.trim() || null,
    compensatedAt: nowIso(),
    settledAt: run.settledAt ?? nowIso(),
  });
}

// --- Reading ---------------------------------------------------------------------

/** Whether the firing has finished moving, however it finished. */
export const isRunSettled = (run: AutomationRun): boolean => isSettledRunStatus(run.status);

/** Whether this firing is sitting in front of a person right now. */
export const isRunAwaitingApproval = (run: AutomationRun): boolean =>
  run.status === "awaiting_approval";

/** Whether the machine took this firing entirely on its own. */
export const isAutonomousRun = (run: AutomationRun): boolean => run.disposition === "auto_execute";

/** Whether this firing still owes the institution a rollback it has not made. */
export const isRunCompensationDue = (run: AutomationRun): boolean =>
  isCompensationOutstanding(run.compensationState);

/** The compensating capability that would undo this firing, when one is owed and declared. */
export const runCompensationCapabilityKey = (run: AutomationRun): string | null =>
  isRunCompensationDue(run) ? run.action.compensationKey : null;

/** Why the gate refused this firing outright, if it did. Empty when it did not. */
export const runBlockingReasons = (run: AutomationRun): readonly AutonomyReason[] =>
  run.reasons.filter(isBlockingAutonomyReason);

/** The value the rule saw for one of the facts it examined, or null if the signal did not carry it. */
export const observedFact = (run: AutomationRun, key: string): string | null => {
  const normalized = normalizeSignalKey(key);
  return run.observedFacts.find((fact) => fact.key === normalized)?.value ?? null;
};

// --- Engine views ----------------------------------------------------------------

/** The metrics engine's view. */
export const toRunSummaryView = (run: AutomationRun): RunSummaryView => ({
  id: run.id,
  status: run.status,
  disposition: run.disposition,
  compensationState: run.compensationState,
});
