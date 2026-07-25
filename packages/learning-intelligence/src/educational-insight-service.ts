import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  archiveEducationalInsight,
  type EducationalInsight,
  type InsightPriority,
  proposeEducationalInsight,
  type ProposeEducationalInsightParams,
  publishEducationalInsight,
  reviseEducationalInsight,
  setInsightPriority,
} from "./educational-insight";
import { insightPublished } from "./learning-intelligence-events";
import {
  EducationalInsightNotFoundError,
  OrganizationNotFoundForInsightError,
  StudentNotFoundForInsightError,
} from "./errors";
import type {
  EducationalInsightRepository,
  OrganizationDirectory,
  StudentDirectory,
} from "./ports";

export interface EducationalInsightServiceDeps {
  readonly repository: EducationalInsightRepository;
  readonly organizations: OrganizationDirectory;
  readonly students: StudentDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export type ProposeEducationalInsightInput = Omit<ProposeEducationalInsightParams, "tenantId"> & {
  readonly tenantId: TenantId;
};

/**
 * Application service for educational insights. Proposes an explainable finding about a validated
 * Student in a validated Organization, allows revision while proposed, and drives
 * proposed → published → archived. Publishes {@link insightPublished}.
 */
export class EducationalInsightService {
  private readonly repository: EducationalInsightRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly students: StudentDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EducationalInsightServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.students = deps.students;
    this.events = deps.events;
  }

  async propose(input: ProposeEducationalInsightInput): Promise<EducationalInsight> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForInsightError(input.organizationId);
    }
    if (!(await this.students.exists(input.tenantId, input.studentId))) {
      throw new StudentNotFoundForInsightError(input.studentId);
    }
    const insight = proposeEducationalInsight(input);
    await this.repository.save(insight);
    return insight;
  }

  async revise(
    tenantId: TenantId,
    id: Uuid,
    title: string,
    narrative: string,
  ): Promise<EducationalInsight> {
    return this.mutate(tenantId, id, (i) => reviseEducationalInsight(i, title, narrative));
  }

  async setPriority(
    tenantId: TenantId,
    id: Uuid,
    priority: InsightPriority,
  ): Promise<EducationalInsight> {
    return this.mutate(tenantId, id, (i) => setInsightPriority(i, priority));
  }

  async publish(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
  ): Promise<EducationalInsight> {
    const published = await this.mutate(tenantId, id, (i) => publishEducationalInsight(i, actor));
    await this.emit(insightPublished(published));
    return published;
  }

  async archive(
    tenantId: TenantId,
    id: Uuid,
    actor: Uuid | null = null,
    note: string | null = null,
  ): Promise<EducationalInsight> {
    return this.mutate(tenantId, id, (i) => archiveEducationalInsight(i, actor, note));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<EducationalInsight> {
    return this.require(tenantId, id);
  }

  async listForStudent(tenantId: TenantId, studentId: Uuid): Promise<EducationalInsight[]> {
    return this.repository.listByStudent(tenantId, studentId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<EducationalInsight[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (insight: EducationalInsight) => EducationalInsight,
  ): Promise<EducationalInsight> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<EducationalInsight> {
    const insight = await this.repository.findById(tenantId, id);
    if (!insight) {
      throw new EducationalInsightNotFoundError(id);
    }
    return insight;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
