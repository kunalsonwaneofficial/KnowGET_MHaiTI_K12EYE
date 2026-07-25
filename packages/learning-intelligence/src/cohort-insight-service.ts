import type { TenantId, Uuid } from "@knowget/types";
import {
  type CohortInsight,
  type CohortScopeType,
  createCohortInsight,
  type CreateCohortInsightParams,
  publishCohortInsight,
  refreshCohortInsight,
  setCohortMembers,
} from "./cohort-insight";
import { summarizeCohort } from "./learning-intelligence";
import { CohortInsightNotFoundError, OrganizationNotFoundForInsightError } from "./errors";
import type {
  CohortInsightRepository,
  LearnerInsightProfileRepository,
  OrganizationDirectory,
} from "./ports";

export interface CohortInsightServiceDeps {
  readonly repository: CohortInsightRepository;
  readonly profiles: LearnerInsightProfileRepository;
  readonly organizations: OrganizationDirectory;
}

export type CreateCohortInsightInput = Omit<CreateCohortInsightParams, "tenantId"> & {
  readonly tenantId: TenantId;
};

/**
 * Application service for cohort insights. Creates a cohort rollup for a validated Organization and
 * **refreshes** it by running the pure cohort-rollup engine over the organization's learner insight
 * profiles (filtered to the cohort's members, if any) — the seam where the per-learner profiles
 * meet the cohort engine. Read-only, descriptive analytics; it mutates no learner profile.
 */
export class CohortInsightService {
  private readonly repository: CohortInsightRepository;
  private readonly profiles: LearnerInsightProfileRepository;
  private readonly organizations: OrganizationDirectory;

  constructor(deps: CohortInsightServiceDeps) {
    this.repository = deps.repository;
    this.profiles = deps.profiles;
    this.organizations = deps.organizations;
  }

  async create(input: CreateCohortInsightInput): Promise<CohortInsight> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForInsightError(input.organizationId);
    }
    const insight = createCohortInsight(input);
    await this.repository.save(insight);
    return insight;
  }

  async setMembers(
    tenantId: TenantId,
    id: Uuid,
    memberStudentIds: readonly Uuid[],
  ): Promise<CohortInsight> {
    return this.mutate(tenantId, id, (c) => setCohortMembers(c, memberStudentIds));
  }

  /** Re-synthesize the cohort rollup from its members' current learner insight profiles. */
  async refresh(tenantId: TenantId, id: Uuid): Promise<CohortInsight> {
    const insight = await this.require(tenantId, id);
    const all = await this.profiles.listByOrganization(tenantId, insight.organizationId);
    const members = new Set(insight.memberStudentIds);
    const scoped = members.size === 0 ? all : all.filter((p) => members.has(p.studentId));
    const refreshed = refreshCohortInsight(insight, summarizeCohort(scoped));
    await this.repository.save(refreshed);
    return refreshed;
  }

  async publish(tenantId: TenantId, id: Uuid): Promise<CohortInsight> {
    return this.mutate(tenantId, id, (c) => publishCohortInsight(c));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CohortInsight> {
    return this.require(tenantId, id);
  }

  async getByScope(
    tenantId: TenantId,
    scopeType: CohortScopeType,
    scopeId: Uuid,
  ): Promise<CohortInsight | null> {
    return this.repository.findByScope(tenantId, scopeType, scopeId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CohortInsight[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (insight: CohortInsight) => CohortInsight,
  ): Promise<CohortInsight> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<CohortInsight> {
    const insight = await this.repository.findById(tenantId, id);
    if (!insight) {
      throw new CohortInsightNotFoundError(id);
    }
    return insight;
  }
}
