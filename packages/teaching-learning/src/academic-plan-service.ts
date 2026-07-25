import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type AcademicPlan,
  archiveAcademicPlan,
  createAcademicPlan,
  publishAcademicPlan,
  renameAcademicPlan,
  setAcademicPlanObjectives,
  setAcademicPlanPeriod,
} from "./academic-plan";
import type { AcademicPlanType } from "./academic-plan-type";
import {
  AcademicPlanNotFoundError,
  DuplicateAcademicPlanError,
  OrganizationNotFoundForTeachingError,
  SubjectNotFoundForTeachingError,
} from "./errors";
import { academicPlanPublished } from "./teaching-learning-events";
import type { AcademicPlanRepository, OrganizationDirectory, SubjectDirectory } from "./ports";

export interface AcademicPlanServiceDeps {
  readonly repository: AcademicPlanRepository;
  readonly organizations: OrganizationDirectory;
  readonly subjects?: SubjectDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface CreateAcademicPlanInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly planType: AcademicPlanType;
  readonly code: string;
  readonly title: string;
  readonly academicYear?: string | null;
  readonly term?: string | null;
  readonly subjectId?: Uuid | null;
  readonly objectives?: readonly string[];
  readonly fromDate?: string | null;
  readonly toDate?: string | null;
}

/**
 * Application service for academic plans. Registers at most one plan per (organization, code)
 * against a validated Organization (and, for subject plans, a validated Subject), and manages
 * its draft → published → archived lifecycle. Publishes {@link academicPlanPublished} when a
 * plan is published — the signal downstream unit and lesson planning consumes.
 */
export class AcademicPlanService {
  private readonly repository: AcademicPlanRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly subjects: SubjectDirectory | undefined;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AcademicPlanServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.subjects = deps.subjects;
    this.events = deps.events;
  }

  async create(input: CreateAcademicPlanInput): Promise<AcademicPlan> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForTeachingError(input.organizationId);
    }
    if (
      input.subjectId &&
      this.subjects &&
      !(await this.subjects.exists(input.tenantId, input.subjectId))
    ) {
      throw new SubjectNotFoundForTeachingError(input.subjectId);
    }
    if (await this.repository.findByCode(input.tenantId, input.organizationId, input.code)) {
      throw new DuplicateAcademicPlanError(input.organizationId, input.code);
    }
    const plan = createAcademicPlan(input);
    await this.repository.save(plan);
    return plan;
  }

  async rename(tenantId: TenantId, id: Uuid, title: string): Promise<AcademicPlan> {
    return this.mutate(tenantId, id, (p) => renameAcademicPlan(p, title));
  }

  async setObjectives(
    tenantId: TenantId,
    id: Uuid,
    objectives: readonly string[],
  ): Promise<AcademicPlan> {
    return this.mutate(tenantId, id, (p) => setAcademicPlanObjectives(p, objectives));
  }

  async setPeriod(
    tenantId: TenantId,
    id: Uuid,
    fromDate: string | null,
    toDate: string | null,
  ): Promise<AcademicPlan> {
    return this.mutate(tenantId, id, (p) => setAcademicPlanPeriod(p, fromDate, toDate));
  }

  async publish(tenantId: TenantId, id: Uuid): Promise<AcademicPlan> {
    const published = await this.mutate(tenantId, id, (p) => publishAcademicPlan(p));
    await this.emit(academicPlanPublished(published));
    return published;
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AcademicPlan> {
    return this.mutate(tenantId, id, (p) => archiveAcademicPlan(p));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AcademicPlan> {
    return this.require(tenantId, id);
  }

  async getByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AcademicPlan | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicPlan[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (plan: AcademicPlan) => AcademicPlan,
  ): Promise<AcademicPlan> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AcademicPlan> {
    const plan = await this.repository.findById(tenantId, id);
    if (!plan) {
      throw new AcademicPlanNotFoundError(id);
    }
    return plan;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
