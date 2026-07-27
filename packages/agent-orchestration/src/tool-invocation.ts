import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type {
  AuthorizationOutcome,
  AuthorizationReason,
  InvocationStatus,
  Reversibility,
  RiskLevel,
} from "./ai-value";
import type { AgentView, InvocationSummaryView, InvocationView, ToolView } from "./ai-view";
import { coversInvocation, isApprovalSpendable, type ApprovalRequest } from "./approval-request";
import { authorizeInvocation, isExecutable } from "./authorization";
import {
  ApprovalSubjectMismatchError,
  InvalidInvocationTransitionError,
  InvocationNotAuthorizedError,
  InvocationNotCompensatableError,
} from "./errors";

/**
 * One agent, one capability, once — the record of a permission-controlled tool invocation.
 *
 * This is where the contract's "permission-controlled tool invocation with rollback" stops being a description
 * and becomes a constructor. There is no way to build this aggregate except by passing the agent and the
 * capability and having the authorization engine open: {@link authorizeToolInvocation} runs the decision itself
 * rather than accepting one, so a caller cannot hand in a verdict it made up. If the decision does not open, no
 * record comes into existence — the refusal happens before there is anything to execute.
 *
 * When a human is required, the factory takes the {@link ApprovalRequest} *object*, not an id. An id is a string
 * and a string can be invented; an approval request is an aggregate that had to be raised, decided by a named
 * person, and matched against this exact agent and capability. That is the difference between a gate and a
 * suggestion.
 *
 * The invocation then carries what a rollback will need — the reversibility and, for a compensatable capability,
 * the key that undoes it — and settles into `succeeded`, `failed`, or, once undone, `compensated` with a link to
 * the invocation that did the undoing. The record keeps the decision that let it run, so an audit reads what was
 * permitted and why, not merely what happened.
 */
export interface ToolInvocation {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly agentId: string;
  /** The plan this belongs to; null for a one-off invocation outside any plan. */
  readonly planId: string | null;
  readonly stepId: string | null;
  readonly capabilityKey: string;
  /** Position in the execution order — what a rollback reverses. */
  readonly ordinal: number;
  readonly riskLevel: RiskLevel;
  readonly reversibility: Reversibility;
  /** The capability that undoes this one, copied from the catalog entry at authorization time. */
  readonly compensationKey: string | null;
  readonly status: InvocationStatus;
  /** The outcome that let this exist. Always `allowed` or `requires_approval`; never `denied`. */
  readonly authorizationOutcome: AuthorizationOutcome;
  readonly authorizationReasons: readonly AuthorizationReason[];
  /** The approval that unblocked it. Non-null exactly when the outcome was `requires_approval`. */
  readonly approvalRequestId: string | null;
  /** The invocation that undid this one. Set only when the status is `compensated`. */
  readonly compensatedByInvocationId: string | null;
  /** A stable failure code — never a message, never a payload. */
  readonly failureCode: string | null;
  readonly startedAt: ISODateString | null;
  readonly settledAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface AuthorizeToolInvocationParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** The agent as the authorization engine reads it — live status, autonomy and grants. */
  readonly agent: AgentView;
  /** The catalog entry as the authorization engine reads it. */
  readonly tool: ToolView;
  readonly planId?: string | null;
  readonly stepId?: string | null;
  readonly ordinal?: number;
  /** The decided approval, when one is needed. The object, not an id — an id proves nothing. */
  readonly approval?: ApprovalRequest | null;
}

/**
 * Authorize and record an invocation, or refuse to create one at all.
 *
 * The order matters. The decision is computed here from the agent and the capability; a supplied approval is then
 * checked to be *this* agent's and *this* capability's, and to be a grant that is still unspent; and only if the
 * decision opens with what is in hand does a record appear. An approval for something else is not a near miss to
 * be tolerated — it is rejected outright, because an approval that could be spent anywhere would be a hole
 * straight through the human gate. An approval already spent is refused for the same reason: it is the record of
 * a decision that was converted into an act, not a licence to repeat that act.
 */
export function authorizeToolInvocation(params: AuthorizeToolInvocationParams): ToolInvocation {
  const decision = authorizeInvocation(params.agent, params.tool);
  const approval = params.approval ?? null;

  if (approval !== null && !coversInvocation(approval, decision.agentId, decision.capabilityKey)) {
    throw new ApprovalSubjectMismatchError(
      approval.id,
      `${decision.agentId}:${decision.capabilityKey}`,
      `${approval.agentId}:${approval.capabilityKey ?? ""}`,
    );
  }

  const granted = approval !== null && isApprovalSpendable(approval);
  if (!isExecutable(decision, granted)) {
    throw new InvocationNotAuthorizedError(
      decision.agentId,
      decision.capabilityKey,
      decision.reasons,
    );
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    agentId: decision.agentId,
    planId: params.planId ?? null,
    stepId: params.stepId ?? null,
    capabilityKey: decision.capabilityKey,
    ordinal: params.ordinal ?? 1,
    riskLevel: decision.riskLevel,
    reversibility: decision.reversibility,
    compensationKey: params.tool.compensationKey,
    status: "authorized",
    authorizationOutcome: decision.outcome,
    authorizationReasons: [...decision.reasons],
    approvalRequestId: decision.outcome === "requires_approval" && approval ? approval.id : null,
    compensatedByInvocationId: null,
    failureCode: null,
    startedAt: null,
    settledAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (invocation: ToolInvocation, patch: Partial<ToolInvocation>): ToolInvocation => ({
  ...invocation,
  ...patch,
  updatedAt: nowIso(),
});

function requireStatus(
  invocation: ToolInvocation,
  from: InvocationStatus,
  to: InvocationStatus,
): void {
  if (invocation.status !== from) {
    throw new InvalidInvocationTransitionError(invocation.status, to);
  }
}

/** The capability is now running. */
export function beginInvocation(invocation: ToolInvocation): ToolInvocation {
  requireStatus(invocation, "authorized", "executing");
  return touch(invocation, { status: "executing", startedAt: nowIso() });
}

/** It did what it was asked. From here it has landed, and undoing it is a separate invocation. */
export function succeedInvocation(invocation: ToolInvocation): ToolInvocation {
  requireStatus(invocation, "executing", "succeeded");
  return touch(invocation, { status: "succeeded", settledAt: nowIso() });
}

/** It did not. `failureCode` is a stable code for an operator, not a message and not a payload. */
export function failInvocation(
  invocation: ToolInvocation,
  failureCode?: string | null,
): ToolInvocation {
  requireStatus(invocation, "executing", "failed");
  return touch(invocation, {
    status: "failed",
    failureCode: failureCode?.trim() || null,
    settledAt: nowIso(),
  });
}

/**
 * Record that a compensating invocation has undone this one, and link the two.
 *
 * Only a landed, compensatable invocation can be marked this way. A `reversible` one changed nothing there is any
 * point undoing, an `irreversible` one cannot be undone at all, and one whose catalog entry named no compensating
 * capability has nothing that could have done the undoing — in every case, recording a compensation would be
 * recording something that did not happen, which is worse than an honest gap in a rollback.
 */
export function compensateInvocation(
  invocation: ToolInvocation,
  compensatingInvocationId: string,
): ToolInvocation {
  requireStatus(invocation, "succeeded", "compensated");
  if (invocation.reversibility !== "compensatable" || invocation.compensationKey === null) {
    throw new InvocationNotCompensatableError(invocation.id, invocation.reversibility);
  }
  const undoneBy = compensatingInvocationId.trim();
  if (undoneBy.length === 0) {
    throw new InvocationNotCompensatableError(invocation.id, invocation.reversibility);
  }
  return touch(invocation, {
    status: "compensated",
    compensatedByInvocationId: undoneBy,
    settledAt: nowIso(),
  });
}

/** Whether the invocation has reached a state it will not leave on its own. */
export const isInvocationSettled = (invocation: ToolInvocation): boolean =>
  invocation.status === "succeeded" ||
  invocation.status === "failed" ||
  invocation.status === "compensated";

/** Whether it changed the world and has not been undone — what a rollback has to deal with. */
export const didInvocationLand = (invocation: ToolInvocation): boolean =>
  invocation.status === "succeeded";

/** Whether a human had to let this one through. */
export const wasHumanGated = (invocation: ToolInvocation): boolean =>
  invocation.approvalRequestId !== null;

/** The rollback engine's view of an invocation. */
export const toInvocationView = (invocation: ToolInvocation): InvocationView => ({
  id: invocation.id,
  stepId: invocation.stepId,
  capabilityKey: invocation.capabilityKey,
  ordinal: invocation.ordinal,
  status: invocation.status,
  reversibility: invocation.reversibility,
  compensationKey: invocation.compensationKey,
});

/** The metrics engine's view of an invocation. */
export const toInvocationSummaryView = (invocation: ToolInvocation): InvocationSummaryView => ({
  id: invocation.id,
  status: invocation.status,
  approvalRequestId: invocation.approvalRequestId,
});
