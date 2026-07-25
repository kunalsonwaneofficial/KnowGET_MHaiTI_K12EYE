import type { TenantId, Uuid } from "@knowget/types";
import {
  DuplicateSchedulingPolicyError,
  OrganizationNotFoundForSchedulingError,
  SchedulingPolicyNotFoundError,
} from "./errors";
import type { PolicyRuleType } from "./policy";
import type { OrganizationDirectory, SchedulingPolicyRepository } from "./ports";
import {
  activatePolicy,
  archivePolicy,
  createSchedulingPolicy,
  renameSchedulingPolicy,
  revisePolicy,
  type SchedulingPolicy,
  setPolicyDescription,
  setPolicyParameters,
} from "./scheduling-policy";

export interface SchedulingPolicyServiceDeps {
  readonly repository: SchedulingPolicyRepository;
  readonly organizations: OrganizationDirectory;
}

export interface CreateSchedulingPolicyInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly ruleType: PolicyRuleType;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly description?: string | null;
}

/**
 * Application service for scheduling policies. Registers at most one policy per
 * (organization, code) against a validated Organization and manages its
 * draft → active → archived lifecycle and version-controlled revisions. Only active policies
 * are enforced by the conflict engine (via {@link SchedulingPolicyRepository.listActiveForConflict}).
 */
export class SchedulingPolicyService {
  private readonly repository: SchedulingPolicyRepository;
  private readonly organizations: OrganizationDirectory;

  constructor(deps: SchedulingPolicyServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
  }

  async create(input: CreateSchedulingPolicyInput): Promise<SchedulingPolicy> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForSchedulingError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.organizationId, input.code)) {
      throw new DuplicateSchedulingPolicyError(input.organizationId, input.code);
    }
    const policy = createSchedulingPolicy(input);
    await this.repository.save(policy);
    return policy;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<SchedulingPolicy> {
    return this.mutate(tenantId, id, (p) => renameSchedulingPolicy(p, name));
  }

  async setParameters(
    tenantId: TenantId,
    id: Uuid,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<SchedulingPolicy> {
    return this.mutate(tenantId, id, (p) => setPolicyParameters(p, parameters));
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<SchedulingPolicy> {
    return this.mutate(tenantId, id, (p) => setPolicyDescription(p, description));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<SchedulingPolicy> {
    return this.mutate(tenantId, id, (p) => activatePolicy(p));
  }

  async revise(tenantId: TenantId, id: Uuid, note: string): Promise<SchedulingPolicy> {
    return this.mutate(tenantId, id, (p) => revisePolicy(p, note));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<SchedulingPolicy> {
    return this.mutate(tenantId, id, (p) => archivePolicy(p));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<SchedulingPolicy> {
    return this.require(tenantId, id);
  }

  async getByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<SchedulingPolicy | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async list(tenantId: TenantId): Promise<SchedulingPolicy[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SchedulingPolicy[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (policy: SchedulingPolicy) => SchedulingPolicy,
  ): Promise<SchedulingPolicy> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<SchedulingPolicy> {
    const policy = await this.repository.findById(tenantId, id);
    if (!policy) {
      throw new SchedulingPolicyNotFoundError(id);
    }
    return policy;
  }
}
