import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { ActionView } from "./decision-view";
import {
  decisionCompensated,
  decisionExecutionCompleted,
  decisionExecutionFailed,
  decisionExecutionRequested,
  decisionRecorded,
  recommendationAccepted,
  recommendationRejected,
} from "./decision-events";
import {
  type DecideOnRecommendationParams,
  type DecisionRecord,
  compensateDecision,
  compensationCapabilityKey,
  completeExecution,
  decideOnRecommendation,
  failExecution,
  requestExecution,
} from "./decision-record";
import {
  CapabilityNotInvocableError,
  DecisionRecordNotFoundError,
  RecommendationNotFoundError,
  RecommendationNotOpenError,
} from "./errors";
import type {
  CapabilityDirectory,
  DecisionRecordRepository,
  RecommendationRepository,
} from "./ports";
import {
  type Recommendation,
  acceptRecommendation,
  isRecommendationOpen,
  rejectRecommendation,
} from "./recommendation";

/**
 * Application service for decision records — what the institution actually did about what it was asked.
 *
 * Two things live here that neither aggregate can hold on its own.
 *
 * The first is the join. A decision is taken *about* a recommendation, and when a person's decision settles the
 * question the recommendation should stop asking it. The aggregates cannot do this between them: the decision
 * record knows the recommendation's id but not its store, and the recommendation refuses an anonymous
 * resolution outright — every answer names a person. So `decide` closes the recommendation exactly when a
 * person decided, with that same person and that same note, and leaves it open otherwise. A deferral is a
 * decision but not an answer, and an `auto_executed` decision has no person behind it by construction; both
 * leave the question standing, and the expiry sweep is what eventually settles an autonomous one nobody came
 * back to. That is the honest reading — silence is not a refusal, and the machine acting is not the institution
 * agreeing.
 *
 * The second is the contract's third rule, made real at the moment it is exercised rather than merely declared.
 * Before anything is decided, the capability the action would invoke and the capability that would undo it are
 * both checked to be invocable, and the same check runs again before a compensation is recorded. A declared way
 * back that names a capability which no longer exists is not a way back, and the difference only shows up when
 * somebody needs it.
 */
export interface DecisionServiceDeps {
  readonly repository: DecisionRecordRepository;
  readonly recommendations: RecommendationRepository;
  readonly capabilities: CapabilityDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class DecisionService {
  private readonly repository: DecisionRecordRepository;
  private readonly recommendations: RecommendationRepository;
  private readonly capabilities: CapabilityDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DecisionServiceDeps) {
    this.repository = deps.repository;
    this.recommendations = deps.recommendations;
    this.capabilities = deps.capabilities;
    this.events = deps.events;
  }

  // --- Deciding --------------------------------------------------------------------

  /**
   * Answer an open recommendation, and record the answer.
   *
   * All four dispositions are refused on a recommendation that has already been settled — the aggregate would
   * refuse the resolution anyway, but only for the two that resolve it, and a deferral recorded against an
   * expired recommendation is a decision about nothing. Both pure moves are made before anything is written, so
   * a refusal from either leaves the store exactly as it was.
   */
  async decide(
    tenantId: TenantId,
    recommendationId: Uuid,
    params: DecideOnRecommendationParams,
  ): Promise<DecisionRecord> {
    const recommendation = await this.requireRecommendation(tenantId, recommendationId);
    if (!isRecommendationOpen(recommendation)) {
      throw new RecommendationNotOpenError(recommendation.id, recommendation.status);
    }
    if (params.action) {
      await this.requireActionInvocable(tenantId, params.action);
    }

    const decision = decideOnRecommendation(recommendation, params);
    const resolved = resolveIfAnswered(recommendation, params);

    await this.repository.save(decision);
    await this.emit(decisionRecorded(decision));

    if (resolved) {
      await this.recommendations.save(resolved.recommendation);
      await this.emit(resolved.announce(resolved.recommendation));
    }

    return decision;
  }

  // --- Execution -------------------------------------------------------------------

  /**
   * Ask the runtime to carry out what was decided. From here the decision may already owe a compensation, so
   * the way back is checked one last time before anything is set in motion.
   */
  async requestExecution(
    tenantId: TenantId,
    id: Uuid,
    executionRef: string,
  ): Promise<DecisionRecord> {
    const decision = await this.require(tenantId, id);
    if (decision.action) {
      await this.requireActionInvocable(tenantId, decision.action);
    }
    return this.transition(
      tenantId,
      id,
      requestExecution,
      decisionExecutionRequested,
      executionRef,
    );
  }

  /** The runtime carried it out. */
  async completeExecution(tenantId: TenantId, id: Uuid): Promise<DecisionRecord> {
    return this.transition(tenantId, id, completeExecution, decisionExecutionCompleted);
  }

  /** The runtime could not. The compensation obligation survives the failure. */
  async failExecution(tenantId: TenantId, id: Uuid, error: string): Promise<DecisionRecord> {
    return this.transition(tenantId, id, failExecution, decisionExecutionFailed, error);
  }

  /**
   * Put back what was done. The compensating capability is checked invocable first: recording a reversal
   * against a capability that cannot be reached would leave the institution believing it had been undone.
   */
  async compensate(tenantId: TenantId, id: Uuid, compensationRef: string): Promise<DecisionRecord> {
    const decision = await this.require(tenantId, id);
    const capabilityKey = compensationCapabilityKey(decision);
    if (capabilityKey) {
      await this.requireInvocable(tenantId, capabilityKey, "compensation");
    }
    return this.transition(tenantId, id, compensateDecision, decisionCompensated, compensationRef);
  }

  // --- Reading ---------------------------------------------------------------------

  /** One decision record, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<DecisionRecord> {
    return this.require(tenantId, id);
  }

  /**
   * Every decision ever taken about one recommendation, oldest first. More than one is normal: a deferral is a
   * decision, and the trail of deferrals before an answer is exactly what a governance review asks to see.
   */
  async listByRecommendation(
    tenantId: TenantId,
    recommendationId: Uuid,
  ): Promise<readonly DecisionRecord[]> {
    return this.repository.listByRecommendation(tenantId, recommendationId);
  }

  /** Everything the institution has done and not yet undone that it declared it could undo. */
  async listCompensationDue(tenantId: TenantId): Promise<readonly DecisionRecord[]> {
    return this.repository.listCompensationDue(tenantId);
  }

  /** Every decision in the tenant. */
  async list(tenantId: TenantId): Promise<readonly DecisionRecord[]> {
    return this.repository.listByTenant(tenantId);
  }

  // --- Internals -------------------------------------------------------------------

  /** The decision under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<DecisionRecord> {
    const decision = await this.repository.findById(tenantId, id);
    if (!decision) {
      throw new DecisionRecordNotFoundError(id);
    }
    return decision;
  }

  /** The recommendation being decided on, or a 404 naming it. */
  private async requireRecommendation(tenantId: TenantId, id: Uuid): Promise<Recommendation> {
    const recommendation = await this.recommendations.findById(tenantId, id);
    if (!recommendation) {
      throw new RecommendationNotFoundError(id);
    }
    return recommendation;
  }

  /**
   * Both halves of an action must be reachable: what it does and what undoes it. A `start_workflow` target is a
   * workflow key rather than a capability key, so only an invocation's target is checked here — the workflow it
   * would start is checked by the service that starts it, against the store that holds it.
   */
  private async requireActionInvocable(tenantId: TenantId, action: ActionView): Promise<void> {
    if (action.kind === "invoke_capability" && action.targetKey) {
      await this.requireInvocable(tenantId, action.targetKey, "action");
    }
    if (action.compensationKey) {
      await this.requireInvocable(tenantId, action.compensationKey, "compensation");
    }
  }

  /** One capability key, checked against the catalog. */
  private async requireInvocable(
    tenantId: TenantId,
    capabilityKey: string,
    role: string,
  ): Promise<void> {
    if (!(await this.capabilities.isInvocable(tenantId, capabilityKey))) {
      throw new CapabilityNotInvocableError(capabilityKey, role);
    }
  }

  /** Load, apply a guarded pure transition, save, announce. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (decision: DecisionRecord, ...args: TArgs) => DecisionRecord,
    announce: (decision: DecisionRecord) => DomainEvent,
    ...args: TArgs
  ): Promise<DecisionRecord> {
    const next = move(await this.require(tenantId, id), ...args);
    await this.repository.save(next);
    await this.emit(announce(next));
    return next;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}

/** What a decision does to the question it answers, when a person is the one answering. */
interface ResolvedRecommendation {
  readonly recommendation: Recommendation;
  readonly announce: (recommendation: Recommendation) => DomainEvent;
}

/**
 * Close the recommendation when — and only when — a named person's decision settled it.
 *
 * `deferred` and `auto_executed` return null on purpose. A deferral says "not yet", which is a decision worth
 * recording and no kind of answer; and an autonomous decision has no `decidedByUserId` at all, so there is
 * nobody to resolve it in whose name.
 */
function resolveIfAnswered(
  recommendation: Recommendation,
  params: DecideOnRecommendationParams,
): ResolvedRecommendation | null {
  const resolvedByUserId = params.decidedByUserId;
  if (!resolvedByUserId) {
    return null;
  }
  const resolution = { resolvedByUserId, note: params.note ?? null };

  if (params.disposition === "approved") {
    return {
      recommendation: acceptRecommendation(recommendation, resolution),
      announce: recommendationAccepted,
    };
  }
  if (params.disposition === "rejected") {
    return {
      recommendation: rejectRecommendation(recommendation, resolution),
      announce: recommendationRejected,
    };
  }
  return null;
}
