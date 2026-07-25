import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { InsightPriority } from "./educational-insight";
import {
  acceptRecommendation,
  actionRecommendation,
  proposeRecommendation,
  type ProposeRecommendationParams,
  type Recommendation,
  rejectRecommendation,
  reviseRecommendation,
  setRecommendationPriority,
} from "./recommendation";
import { recommendationAccepted, recommendationProposed } from "./learning-intelligence-events";
import {
  OrganizationNotFoundForInsightError,
  RecommendationNotFoundError,
  StudentNotFoundForInsightError,
} from "./errors";
import type { OrganizationDirectory, RecommendationRepository, StudentDirectory } from "./ports";

export interface RecommendationServiceDeps {
  readonly repository: RecommendationRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export type ProposeRecommendationInput = Omit<ProposeRecommendationParams, "tenantId"> & {
  readonly tenantId: TenantId;
};

/**
 * Application service for recommendations. Proposes an evidence-grounded recommendation for a
 * validated Student in a validated Organization and drives the **human-in-the-loop** lifecycle
 * proposed → accepted → actioned | rejected — the platform proposes; a human accepts or rejects
 * (recorded with the decider); accepted work is later marked actioned. Publishes
 * {@link recommendationProposed} and {@link recommendationAccepted}.
 */
export class RecommendationService {
  private readonly repository: RecommendationRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: RecommendationServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  async propose(input: ProposeRecommendationInput): Promise<Recommendation> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForInsightError(input.organizationId);
    }
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForInsightError(input.studentId);
    }
    const recommendation = proposeRecommendation(input);
    await this.repository.save(recommendation);
    await this.emit(recommendationProposed(recommendation));
    return recommendation;
  }

  async revise(
    tenantId: TenantId,
    id: Uuid,
    action: string,
    rationale: string,
  ): Promise<Recommendation> {
    return this.mutate(tenantId, id, (r) => reviseRecommendation(r, action, rationale));
  }

  async setPriority(
    tenantId: TenantId,
    id: Uuid,
    priority: InsightPriority,
  ): Promise<Recommendation> {
    return this.mutate(tenantId, id, (r) => setRecommendationPriority(r, priority));
  }

  async accept(
    tenantId: TenantId,
    id: Uuid,
    decidedBy: Uuid | null = null,
    note: string | null = null,
  ): Promise<Recommendation> {
    const accepted = await this.mutate(tenantId, id, (r) =>
      acceptRecommendation(r, decidedBy, note),
    );
    await this.emit(recommendationAccepted(accepted));
    return accepted;
  }

  async reject(
    tenantId: TenantId,
    id: Uuid,
    decidedBy: Uuid | null = null,
    note: string | null = null,
  ): Promise<Recommendation> {
    return this.mutate(tenantId, id, (r) => rejectRecommendation(r, decidedBy, note));
  }

  async action(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<Recommendation> {
    return this.mutate(tenantId, id, (r) => actionRecommendation(r, actor, note));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Recommendation> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<Recommendation[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Recommendation[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (recommendation: Recommendation) => Recommendation,
  ): Promise<Recommendation> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Recommendation> {
    const recommendation = await this.repository.findById(tenantId, id);
    if (!recommendation) {
      throw new RecommendationNotFoundError(id);
    }
    return recommendation;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
