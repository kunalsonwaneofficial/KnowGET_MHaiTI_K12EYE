import type { TenantId, Uuid } from "@knowget/types";
import {
  activatePolicy,
  archivePolicy,
  type AttendancePolicy,
  createAttendancePolicy,
  renameAttendancePolicy,
  revisePolicy,
  setPolicyDescription,
  setPolicyParameters,
} from "./attendance-policy";
import type { AttendancePolicyRuleType } from "./attendance-policy-rule";
import {
  AttendancePolicyNotFoundError,
  DuplicateAttendancePolicyError,
  OrganizationNotFoundForAttendanceError,
} from "./errors";
import type { AttendancePolicyRepository, OrganizationDirectory } from "./ports";

export interface AttendancePolicyServiceDeps {
  readonly repository: AttendancePolicyRepository;
  readonly organizations: OrganizationDirectory;
}

export interface CreateAttendancePolicyInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly code: string;
  readonly name: string;
  readonly ruleType: AttendancePolicyRuleType;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly description?: string | null;
}

/**
 * Application service for attendance policies. Registers at most one policy per
 * (organization, code) against a validated Organization and manages its
 * draft → active → archived lifecycle and version-controlled revisions. Only active policies
 * are evaluated by the policy engine.
 */
export class AttendancePolicyService {
  private readonly repository: AttendancePolicyRepository;
  private readonly organizations: OrganizationDirectory;

  constructor(deps: AttendancePolicyServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
  }

  async create(input: CreateAttendancePolicyInput): Promise<AttendancePolicy> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAttendanceError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.organizationId, input.code)) {
      throw new DuplicateAttendancePolicyError(input.organizationId, input.code);
    }
    const policy = createAttendancePolicy(input);
    await this.repository.save(policy);
    return policy;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<AttendancePolicy> {
    return this.mutate(tenantId, id, (p) => renameAttendancePolicy(p, name));
  }

  async setParameters(
    tenantId: TenantId,
    id: Uuid,
    parameters: Readonly<Record<string, unknown>>,
  ): Promise<AttendancePolicy> {
    return this.mutate(tenantId, id, (p) => setPolicyParameters(p, parameters));
  }

  async setDescription(
    tenantId: TenantId,
    id: Uuid,
    description: string | null,
  ): Promise<AttendancePolicy> {
    return this.mutate(tenantId, id, (p) => setPolicyDescription(p, description));
  }

  async activate(tenantId: TenantId, id: Uuid): Promise<AttendancePolicy> {
    return this.mutate(tenantId, id, (p) => activatePolicy(p));
  }

  async revise(tenantId: TenantId, id: Uuid, note: string): Promise<AttendancePolicy> {
    return this.mutate(tenantId, id, (p) => revisePolicy(p, note));
  }

  async archive(tenantId: TenantId, id: Uuid): Promise<AttendancePolicy> {
    return this.mutate(tenantId, id, (p) => archivePolicy(p));
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<AttendancePolicy> {
    return this.require(tenantId, id);
  }

  async getByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AttendancePolicy | null> {
    return this.repository.findByCode(tenantId, organizationId, code);
  }

  async list(tenantId: TenantId): Promise<AttendancePolicy[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AttendancePolicy[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (policy: AttendancePolicy) => AttendancePolicy,
  ): Promise<AttendancePolicy> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<AttendancePolicy> {
    const policy = await this.repository.findById(tenantId, id);
    if (!policy) {
      throw new AttendancePolicyNotFoundError(id);
    }
    return policy;
  }
}
