import type { TenantId, Uuid } from "@knowget/types";
import {
  ApprovalNotFoundError,
  OrganizationNotFoundForGovernanceError,
  PersonNotFoundForGovernanceError,
} from "./errors";
import {
  type ApprovalKind,
  approveApproval,
  type DecideApprovalParams,
  type GovernanceApproval,
  type OpenApprovalParams,
  openApproval,
  rejectApproval,
  requestApprovalChanges,
  submitApproval,
} from "./governance-approval";
import type { GovernanceApprovalRepository, OrganizationDirectory, PersonDirectory } from "./ports";

export interface GovernanceApprovalServiceDeps {
  readonly repository: GovernanceApprovalRepository;
  readonly organizations: OrganizationDirectory;
  readonly persons: PersonDirectory;
}

/**
 * Application service for governance approvals. Drives the single reusable approval
 * workflow (draft → in_review → approved | rejected) for every governance subject —
 * policy, committee, resolution and delegation approval — validating the
 * organization and the submitter/decider Persons, and preserving the full decision
 * history. The workflow itself is the Phase-1 engine; this service is its durable,
 * tenant-scoped, transport-agnostic host.
 */
export class GovernanceApprovalService {
  private readonly repository: GovernanceApprovalRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly persons: PersonDirectory;

  constructor(deps: GovernanceApprovalServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.persons = deps.persons;
  }

  async open(input: OpenApprovalParams): Promise<GovernanceApproval> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.submittedById);
    const approval = openApproval(input);
    await this.repository.save(approval);
    return approval;
  }

  async submit(tenantId: TenantId, id: Uuid): Promise<GovernanceApproval> {
    const updated = submitApproval(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  async approve(
    tenantId: TenantId,
    id: Uuid,
    params: DecideApprovalParams,
  ): Promise<GovernanceApproval> {
    await this.assertPersonExists(tenantId, params.decidedById);
    const updated = approveApproval(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async reject(
    tenantId: TenantId,
    id: Uuid,
    params: DecideApprovalParams,
  ): Promise<GovernanceApproval> {
    await this.assertPersonExists(tenantId, params.decidedById);
    const updated = rejectApproval(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async requestChanges(
    tenantId: TenantId,
    id: Uuid,
    note?: string | null,
  ): Promise<GovernanceApproval> {
    const updated = requestApprovalChanges(await this.require(tenantId, id), note);
    await this.repository.save(updated);
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<GovernanceApproval> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<GovernanceApproval[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForSubject(
    tenantId: TenantId,
    kind: ApprovalKind,
    subjectId: Uuid,
  ): Promise<GovernanceApproval[]> {
    return this.repository.listBySubject(tenantId, kind, subjectId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<GovernanceApproval[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForGovernanceError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForGovernanceError(personId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<GovernanceApproval> {
    const approval = await this.repository.findById(tenantId, id);
    if (!approval) {
      throw new ApprovalNotFoundError(id);
    }
    return approval;
  }
}
