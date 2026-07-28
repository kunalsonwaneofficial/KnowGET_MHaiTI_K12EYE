import type { EventBus } from "@knowget/events";
import type { DomainEvent, ISODateString, TenantId, Uuid } from "@knowget/types";
import type { RankedRecommendation } from "./decision-view";
import {
  recommendationAccepted,
  recommendationEvidenceAdded,
  recommendationEvidenceRetracted,
  recommendationExpired,
  recommendationRaised,
  recommendationRejected,
  recommendationSuperseded,
  recommendationWithdrawn,
} from "./decision-events";
import {
  EvidenceSourceNotFoundError,
  OrganizationNotFoundForDecisionError,
  RecommendationNotFoundError,
} from "./errors";
import type {
  EvidenceSourceDirectory,
  OrganizationDirectory,
  RecommendationRepository,
} from "./ports";
import { rankRecommendations } from "./prioritization";
import {
  type CiteEvidenceParams,
  type CreateRecommendationParams,
  type Recommendation,
  type RecommendationEvidence,
  type ResolveRecommendationParams,
  acceptRecommendation,
  addEvidence,
  createRecommendation,
  expireRecommendation,
  hasLapsedAt,
  rejectRecommendation,
  retractEvidence,
  supersedeRecommendation,
  toRecommendationPriorityView,
  withdrawRecommendation,
} from "./recommendation";

/**
 * Application service for recommendations — the proposals the institution is asked to answer.
 *
 * One rule lives here rather than in the aggregate, and it is the contract's second: **a recommendation ships
 * with an evidence chain**. The aggregate enforces the chain's *shape* — that it grounds the recommendation, that
 * nothing in it dangles, that retracting a citation cannot hollow it out — but it holds no index of the
 * institution's records and so cannot tell a citation of a real knowledge graph entity from a citation of a
 * plausible-looking string. A chain of references to things that are not there passes every structural check and
 * satisfies none of the point of the rule. So every citation is checked against its source as it is made, at the
 * only two doors citations come through: raising, and adding one later.
 *
 * The other thing that lives here is the sweep. `expireLapsed` is the only path by which a recommendation settles
 * with nobody behind it, and it belongs to a service because it needs the store — the aggregate can say whether
 * one recommendation has lapsed, but only a query can find all of them.
 */
export interface RecommendationServiceDeps {
  readonly repository: RecommendationRepository;
  readonly organizations: OrganizationDirectory;
  readonly evidenceSources: EvidenceSourceDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export class RecommendationService {
  private readonly repository: RecommendationRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly evidenceSources: EvidenceSourceDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RecommendationServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.evidenceSources = deps.evidenceSources;
    this.events = deps.events;
  }

  // --- Raising ---------------------------------------------------------------------

  /**
   * Raise a proposal on a chain that both grounds it and points at records that exist. The citations are checked
   * before the aggregate is built, so a recommendation whose evidence cannot be found is never written at all.
   */
  async raise(input: CreateRecommendationParams): Promise<Recommendation> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForDecisionError(input.organizationId);
    }
    await this.requireEvidenceExists(input.tenantId, input.evidence);

    const recommendation = createRecommendation(input);
    await this.repository.save(recommendation);
    await this.emit(recommendationRaised(recommendation));
    return recommendation;
  }

  // --- Evidence --------------------------------------------------------------------

  /** Cite one more thing on an open recommendation, after checking the thing is there to cite. */
  async cite(tenantId: TenantId, id: Uuid, params: CiteEvidenceParams): Promise<Recommendation> {
    if (!(await this.evidenceSources.exists(tenantId, params.source, params.ref.trim()))) {
      throw new EvidenceSourceNotFoundError(params.source, params.ref);
    }
    return this.transition(tenantId, id, addEvidence, recommendationEvidenceAdded, params);
  }

  /**
   * Take a citation back. Refused by the aggregate when what remains would no longer ground the recommendation —
   * the way out of a justification that no longer holds is {@link RecommendationService.withdraw}.
   */
  async retract(tenantId: TenantId, id: Uuid, evidenceId: string): Promise<Recommendation> {
    return this.transition(
      tenantId,
      id,
      retractEvidence,
      recommendationEvidenceRetracted,
      evidenceId,
    );
  }

  // --- Answering -------------------------------------------------------------------

  /** A named person agrees. What follows from that is a decision record, not merely a status. */
  async accept(
    tenantId: TenantId,
    id: Uuid,
    params: ResolveRecommendationParams,
  ): Promise<Recommendation> {
    return this.transition(tenantId, id, acceptRecommendation, recommendationAccepted, params);
  }

  /** A named person disagrees. */
  async reject(
    tenantId: TenantId,
    id: Uuid,
    params: ResolveRecommendationParams,
  ): Promise<Recommendation> {
    return this.transition(tenantId, id, rejectRecommendation, recommendationRejected, params);
  }

  /** The proposer takes it back — including when its justification no longer holds. */
  async withdraw(
    tenantId: TenantId,
    id: Uuid,
    params: ResolveRecommendationParams,
  ): Promise<Recommendation> {
    return this.transition(tenantId, id, withdrawRecommendation, recommendationWithdrawn, params);
  }

  /**
   * A revision replaced it. The successor is loaded rather than taken on trust: a superseded recommendation
   * naming a successor that does not exist is a dead end in the institution's memory, which is precisely what
   * recording the successor was meant to prevent.
   */
  async supersede(tenantId: TenantId, id: Uuid, successorId: Uuid): Promise<Recommendation> {
    await this.require(tenantId, successorId);
    return this.transition(
      tenantId,
      id,
      supersedeRecommendation,
      recommendationSuperseded,
      successorId,
    );
  }

  /**
   * Settle everything whose window has closed with nobody having answered.
   *
   * The instant is supplied rather than read from a clock, so a sweep is as testable as every engine in this
   * package, and so an operator can ask what *would* lapse by a given moment without anything moving.
   */
  async expireLapsed(tenantId: TenantId, asOf: ISODateString): Promise<readonly Recommendation[]> {
    const open = await this.repository.listOpen(tenantId);
    const expired: Recommendation[] = [];

    for (const recommendation of open) {
      if (!hasLapsedAt(recommendation, asOf)) {
        continue;
      }
      const next = expireRecommendation(recommendation);
      await this.repository.save(next);
      await this.emit(recommendationExpired(next));
      expired.push(next);
    }

    return expired;
  }

  // --- Reading ---------------------------------------------------------------------

  /** One recommendation, or a 404. */
  async get(tenantId: TenantId, id: Uuid): Promise<Recommendation> {
    return this.require(tenantId, id);
  }

  /** Everything still waiting on an answer. */
  async listOpen(tenantId: TenantId): Promise<readonly Recommendation[]> {
    return this.repository.listOpen(tenantId);
  }

  /** Everything ever raised about one subject — how a case worker sees the whole story of one student. */
  async listBySubject(
    tenantId: TenantId,
    subjectDomain: string,
    subjectId: string,
  ): Promise<readonly Recommendation[]> {
    return this.repository.listBySubject(tenantId, subjectDomain, subjectId);
  }

  /** Every recommendation in the tenant. */
  async list(tenantId: TenantId): Promise<readonly Recommendation[]> {
    return this.repository.listByTenant(tenantId);
  }

  /**
   * The open backlog in the order it deserves attention. The ranking is the prioritization engine's, computed
   * against the supplied instant so the queue an administrator is shown and the queue a test asserts on are the
   * same function of the same inputs.
   */
  async prioritized(
    tenantId: TenantId,
    asOf: ISODateString,
  ): Promise<readonly RankedRecommendation[]> {
    const open = await this.repository.listOpen(tenantId);
    return rankRecommendations(open.map(toRecommendationPriorityView), asOf);
  }

  // --- Internals -------------------------------------------------------------------

  /** The recommendation under this id in this tenant, or a 404 naming it. */
  private async require(tenantId: TenantId, id: Uuid): Promise<Recommendation> {
    const recommendation = await this.repository.findById(tenantId, id);
    if (!recommendation) {
      throw new RecommendationNotFoundError(id);
    }
    return recommendation;
  }

  /** Rule two, at the door: every cited record is checked to exist before the chain is believed. */
  private async requireEvidenceExists(
    tenantId: TenantId,
    evidence: readonly RecommendationEvidence[],
  ): Promise<void> {
    for (const piece of evidence) {
      if (!(await this.evidenceSources.exists(tenantId, piece.source, piece.ref))) {
        throw new EvidenceSourceNotFoundError(piece.source, piece.ref);
      }
    }
  }

  /** Load, apply a guarded pure transition, save, announce. Every move on this aggregate is this. */
  private async transition<TArgs extends unknown[]>(
    tenantId: TenantId,
    id: Uuid,
    move: (recommendation: Recommendation, ...args: TArgs) => Recommendation,
    announce: (recommendation: Recommendation) => DomainEvent,
    ...args: TArgs
  ): Promise<Recommendation> {
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
