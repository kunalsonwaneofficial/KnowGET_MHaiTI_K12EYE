import { nowIso } from "@knowget/shared";
import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import { approvalExpired, approvalGranted, approvalRejected } from "./ai-events";
import {
  type ApprovalDecisionParams,
  type ApprovalRequest,
  approveRequest,
  expireRequest,
  isExpiredAt,
  rejectRequest,
} from "./approval-request";
import { ApprovalRequestNotFoundError, ApprovalSubjectMismatchError } from "./errors";
import type { ApprovalRequestRepository } from "./ports";

/**
 * Application service for the human approval queue.
 *
 * Requests are *raised* by whatever needed the gate — {@link ExecutionPlanService} for a plan, the invocation
 * path for a single call — because raising one is inseparable from the thing that needs it. What is generic is
 * everything after: reading the queue, deciding an invocation-level request, and sweeping the ones nobody
 * answered. Those live here.
 *
 * Deciding a plan-level request through this service is refused. Not because it would fail — the aggregate would
 * happily record the decision — but because it would leave the plan sitting in `awaiting_approval` behind a
 * request marked `approved`, which is the single most misleading state this domain could produce: the audit
 * trail would show a person allowing something that then never ran, and nobody would be able to say why. Plan
 * decisions go through the plan service, which moves both together.
 */
export interface ApprovalServiceDeps {
  readonly repository: ApprovalRequestRepository;
  readonly events?: Pick<EventBus, "publish">;
}

export class ApprovalService {
  private readonly repository: ApprovalRequestRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ApprovalServiceDeps) {
    this.repository = deps.repository;
    this.events = deps.events;
  }

  async get(tenantId: TenantId, id: Uuid): Promise<ApprovalRequest> {
    return this.require(tenantId, id);
  }

  /** The queue: everything still waiting on a person, in this tenant. */
  async listPending(tenantId: TenantId): Promise<ApprovalRequest[]> {
    return this.repository.listPending(tenantId);
  }

  /** Every request ever raised about one plan or one invocation — the audit trail for that subject. */
  async listBySubject(
    tenantId: TenantId,
    subject: string,
    subjectId: string,
  ): Promise<ApprovalRequest[]> {
    return this.repository.listBySubject(tenantId, subject, subjectId);
  }

  async list(tenantId: TenantId): Promise<ApprovalRequest[]> {
    return this.repository.listByTenant(tenantId);
  }

  /** The open request standing in front of a subject, if there is one. */
  async findOpenFor(
    tenantId: TenantId,
    subject: string,
    subjectId: string,
  ): Promise<ApprovalRequest | null> {
    return this.repository.findOpenForSubject(tenantId, subject, subjectId);
  }

  /** A named person lets a single invocation through. */
  async approve(
    tenantId: TenantId,
    id: Uuid,
    params: ApprovalDecisionParams,
  ): Promise<ApprovalRequest> {
    const decided = approveRequest(await this.requireInvocationRequest(tenantId, id), params);
    await this.repository.save(decided);
    await this.emit(approvalGranted(decided));
    return decided;
  }

  /** A named person refuses it. */
  async reject(
    tenantId: TenantId,
    id: Uuid,
    params: ApprovalDecisionParams,
  ): Promise<ApprovalRequest> {
    const decided = rejectRequest(await this.requireInvocationRequest(tenantId, id), params);
    await this.repository.save(decided);
    await this.emit(approvalRejected(decided));
    return decided;
  }

  /**
   * Expire the requests whose deadline has passed. Applies to every subject, plan-level included: a plan whose
   * gate timed out is not waiting on anyone any more, and leaving the request `pending` forever would keep an
   * approver's queue filling with things nobody can act on. Silence is recorded as silence, never as a refusal.
   */
  async expireDue(tenantId: TenantId, at: ISODateString = nowIso()): Promise<ApprovalRequest[]> {
    const pending = await this.repository.listPending(tenantId);
    const expired: ApprovalRequest[] = [];
    for (const request of pending) {
      if (!isExpiredAt(request, at)) {
        continue;
      }
      const settled = expireRequest(request);
      await this.repository.save(settled);
      await this.emit(approvalExpired(settled));
      expired.push(settled);
    }
    return expired;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ApprovalRequest> {
    const request = await this.repository.findById(tenantId, id);
    if (!request) {
      throw new ApprovalRequestNotFoundError(id);
    }
    return request;
  }

  /** A decision taken here must be one this service can honour end to end. */
  private async requireInvocationRequest(tenantId: TenantId, id: Uuid): Promise<ApprovalRequest> {
    const request = await this.require(tenantId, id);
    if (request.subject !== "tool_invocation") {
      throw new ApprovalSubjectMismatchError(request.id, "tool_invocation", request.subject);
    }
    return request;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
