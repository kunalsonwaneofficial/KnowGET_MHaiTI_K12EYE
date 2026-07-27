import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { ApprovalDecision, ApprovalSubject, AuthorizationReason, RiskLevel } from "./ai-value";
import type { ApprovalView, AuthorizationDecision } from "./ai-view";
import {
  AnonymousApprovalDecisionError,
  ApprovalAlreadyDecidedError,
  ApprovalAlreadySpentError,
  ApprovalNotGrantedError,
  EmptyApprovalSubjectError,
} from "./errors";

/**
 * The human gate, as a record.
 *
 * The contract asks for *enforceable* human approval, and the word doing the work is "enforceable". An approval
 * that exists only as a flag someone remembered to set is a convention; this aggregate is a durable artifact that
 * says which person allowed which agent to do which specific thing, when, and on what stated grounds — and it can
 * only be spent once, on the subject it names.
 *
 * A request carries the authorization decision that produced it: the stable `reasons` codes and the `riskLevel`
 * that made a human necessary. That is what an approver is answering, and keeping it on the record means the
 * approval can be audited later against what was actually put in front of the person, not against what the
 * catalog happens to say today.
 *
 * `pending → approved | rejected | expired`, and never again. A decision is made once and stands; re-deciding it
 * would erase the accountability the record exists to create.
 */
export interface ApprovalRequest {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  /** Whether a whole plan or a single invocation is waiting on this. */
  readonly subject: ApprovalSubject;
  /** The plan or invocation this covers. An approval is not transferable to another subject. */
  readonly subjectId: string;
  /** The agent that would act. Half of what an invocation approval is checked against. */
  readonly agentId: string;
  /** The capability that would be invoked; null for a whole-plan approval. The other half. */
  readonly capabilityKey: string | null;
  /** Why a human was needed — the decision's stable reason codes, as they were at the time of asking. */
  readonly reasons: readonly AuthorizationReason[];
  /** The worst risk at stake, as it was at the time of asking. */
  readonly riskLevel: RiskLevel;
  readonly decision: ApprovalDecision;
  /** The person accountable for the decision. Null only while pending or expired. */
  readonly decidedByUserId: string | null;
  readonly decidedAt: ISODateString | null;
  readonly decisionNote: string | null;
  /** When the request stops being answerable. Null means it waits indefinitely. */
  readonly expiresAt: ISODateString | null;
  /**
   * When the grant was spent. Null while it is still unspent — which, for a granted request, is the only state
   * in which it authorizes anything. This is what makes the approval single-use rather than a standing licence.
   */
  readonly consumedAt: ISODateString | null;
  /** The invocation that spent the grant. Set together with {@link ApprovalRequest.consumedAt}. */
  readonly consumedByInvocationId: string | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateApprovalRequestParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly subject: ApprovalSubject;
  readonly subjectId: string;
  readonly agentId: string;
  readonly capabilityKey?: string | null;
  readonly reasons?: readonly AuthorizationReason[];
  readonly riskLevel: RiskLevel;
  readonly expiresAt?: ISODateString | null;
}

/** What a person supplies when they answer. The identity is required; the note is theirs to add. */
export interface ApprovalDecisionParams {
  readonly decidedByUserId: string;
  readonly note?: string | null;
}

/** Raise a request for a human decision. Starts `pending` with nobody yet accountable for it. */
export function createApprovalRequest(params: CreateApprovalRequestParams): ApprovalRequest {
  const subjectId = params.subjectId.trim();
  if (subjectId.length === 0) {
    throw new EmptyApprovalSubjectError();
  }
  const agentId = params.agentId.trim();
  if (agentId.length === 0) {
    throw new EmptyApprovalSubjectError();
  }

  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    subject: params.subject,
    subjectId,
    agentId,
    capabilityKey: params.capabilityKey?.trim() || null,
    reasons: [...(params.reasons ?? [])],
    riskLevel: params.riskLevel,
    decision: "pending",
    decidedByUserId: null,
    decidedAt: null,
    decisionNote: null,
    expiresAt: params.expiresAt ?? null,
    consumedAt: null,
    consumedByInvocationId: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Raise a request straight from the authorization decision that demanded it, so the reasons and the risk on the
 * record are exactly the ones the engine produced — not a paraphrase assembled by whatever called it.
 */
export function requestApprovalFor(
  decision: AuthorizationDecision,
  params: Omit<CreateApprovalRequestParams, "agentId" | "capabilityKey" | "reasons" | "riskLevel">,
): ApprovalRequest {
  return createApprovalRequest({
    ...params,
    agentId: decision.agentId,
    capabilityKey: decision.capabilityKey,
    reasons: decision.reasons,
    riskLevel: decision.riskLevel,
  });
}

const touch = (request: ApprovalRequest, patch: Partial<ApprovalRequest>): ApprovalRequest => ({
  ...request,
  ...patch,
  updatedAt: nowIso(),
});

/** A decision may be recorded exactly once, and only while the request is still open. */
function requirePending(request: ApprovalRequest): void {
  if (request.decision !== "pending") {
    throw new ApprovalAlreadyDecidedError(request.id, request.decision);
  }
}

/** Every decision names a person. An anonymous approval is not an approval. */
function requireDecider(params: ApprovalDecisionParams): string {
  const decidedByUserId = params.decidedByUserId.trim();
  if (decidedByUserId.length === 0) {
    throw new AnonymousApprovalDecisionError();
  }
  return decidedByUserId;
}

function decide(
  request: ApprovalRequest,
  decision: ApprovalDecision,
  params: ApprovalDecisionParams,
): ApprovalRequest {
  requirePending(request);
  return touch(request, {
    decision,
    decidedByUserId: requireDecider(params),
    decidedAt: nowIso(),
    decisionNote: params.note?.trim() || null,
  });
}

/** A named person lets it through. */
export const approveRequest = (
  request: ApprovalRequest,
  params: ApprovalDecisionParams,
): ApprovalRequest => decide(request, "approved", params);

/** A named person refuses it. */
export const rejectRequest = (
  request: ApprovalRequest,
  params: ApprovalDecisionParams,
): ApprovalRequest => decide(request, "rejected", params);

/**
 * Nobody answered in time. This is the only decision without a person behind it, which is exactly why it is
 * modelled as its own outcome rather than a rejection: silence is not a refusal, and the record should not
 * suggest someone considered it.
 */
export function expireRequest(request: ApprovalRequest): ApprovalRequest {
  requirePending(request);
  return touch(request, { decision: "expired", decidedAt: nowIso() });
}

/**
 * Spend the grant on the invocation it authorized.
 *
 * A grant is for one act. Without this, a single "yes" to an agent-and-capability pair outside a plan would keep
 * authorizing that call for as long as the record stood — one human decision silently becoming a standing
 * licence, which is the difference between a gate and a door left open. Refused unless the request was granted
 * and is still unspent, so the second attempt to spend it fails rather than quietly succeeding.
 */
export function consumeApproval(request: ApprovalRequest, invocationId: string): ApprovalRequest {
  if (request.decision !== "approved") {
    throw new ApprovalNotGrantedError(request.id, request.decision);
  }
  if (request.consumedAt !== null) {
    throw new ApprovalAlreadySpentError(request.id, request.consumedByInvocationId);
  }
  return touch(request, { consumedAt: nowIso(), consumedByInvocationId: invocationId });
}

/** Whether the request is still waiting on a person. */
export const isApprovalOpen = (request: ApprovalRequest): boolean => request.decision === "pending";

/** Whether a human actually let this through. Necessary to unblock an invocation, but not sufficient. */
export const isApprovalGranted = (request: ApprovalRequest): boolean =>
  request.decision === "approved";

/** Whether the grant has already been spent, and so authorizes nothing further. */
export const isApprovalSpent = (request: ApprovalRequest): boolean => request.consumedAt !== null;

/**
 * Whether this grant can authorize an invocation right now — granted *and* unspent. This, not
 * {@link isApprovalGranted}, is what the invocation path checks: a spent approval is a historical record of a
 * decision, not a live permission.
 */
export const isApprovalSpendable = (request: ApprovalRequest): boolean =>
  isApprovalGranted(request) && !isApprovalSpent(request);

/**
 * Whether the request has passed its deadline at the given instant. ISO-8601 UTC timestamps compare correctly as
 * strings, so this needs no clock of its own — the caller supplies the instant, which keeps the aggregate pure
 * and the test deterministic.
 */
export const isExpiredAt = (request: ApprovalRequest, at: ISODateString): boolean =>
  request.expiresAt !== null && at >= request.expiresAt;

/** Whether the request covers this exact agent and capability. Half of why approvals are not transferable. */
export const coversInvocation = (
  request: ApprovalRequest,
  agentId: string,
  capabilityKey: string,
): boolean =>
  request.subject === "tool_invocation" &&
  request.agentId === agentId &&
  request.capabilityKey === capabilityKey;

/** The metrics engine's view of an approval. */
export const toApprovalView = (request: ApprovalRequest): ApprovalView => ({
  id: request.id,
  decision: request.decision,
});
