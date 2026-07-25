import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { ParticipantType } from "./attendance-record";
import { leaveApproved, leaveRejected, leaveRequested } from "./attendance-presence-events";
import {
  LeaveNotFoundError,
  OrganizationNotFoundForAttendanceError,
  ParticipantNotFoundForAttendanceError,
} from "./errors";
import {
  addSupportingDocument,
  approveLeave,
  cancelLeave,
  createLeave,
  type Leave,
  rejectLeave,
} from "./leave";
import type { LeaveType, SupportingDocument } from "./leave-type";
import type { LeaveRepository, OrganizationDirectory, ParticipantDirectory } from "./ports";

export interface LeaveServiceDeps {
  readonly repository: LeaveRepository;
  readonly organizations: OrganizationDirectory;
  readonly participants: ParticipantDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

export interface RequestLeaveInput {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly personId: Uuid;
  readonly holderType: ParticipantType;
  readonly leaveType: LeaveType;
  readonly fromDate: string;
  readonly toDate: string;
  readonly reason: string;
  readonly supportingDocuments?: readonly SupportingDocument[];
}

/**
 * Application service for leave. Files a leave request for a validated participant against a
 * validated Organization, runs the requested → approved | rejected | cancelled workflow, and
 * accepts supporting documents while pending. Publishes {@link leaveRequested},
 * {@link leaveApproved} and {@link leaveRejected}. Approved leave is consumed by the policy
 * engine to excuse absences.
 */
export class LeaveService {
  private readonly repository: LeaveRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly participants: ParticipantDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: LeaveServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.participants = deps.participants;
    this.events = deps.events;
  }

  async request(input: RequestLeaveInput): Promise<Leave> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForAttendanceError(input.organizationId);
    }
    if (!(await this.participants.exists(input.tenantId, input.personId))) {
      throw new ParticipantNotFoundForAttendanceError(input.personId);
    }
    const leave = createLeave(input);
    await this.repository.save(leave);
    await this.emit(leaveRequested(leave));
    return leave;
  }

  async approve(
    tenantId: TenantId,
    id: Uuid,
    reviewedBy: Uuid,
    note: string | null = null,
  ): Promise<Leave> {
    const leave = approveLeave(await this.require(tenantId, id), reviewedBy, note);
    await this.repository.save(leave);
    await this.emit(leaveApproved(leave));
    return leave;
  }

  async reject(
    tenantId: TenantId,
    id: Uuid,
    reviewedBy: Uuid,
    note: string | null = null,
  ): Promise<Leave> {
    const leave = rejectLeave(await this.require(tenantId, id), reviewedBy, note);
    await this.repository.save(leave);
    await this.emit(leaveRejected(leave));
    return leave;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Leave> {
    const leave = cancelLeave(await this.require(tenantId, id));
    await this.repository.save(leave);
    return leave;
  }

  async addDocument(tenantId: TenantId, id: Uuid, document: SupportingDocument): Promise<Leave> {
    const leave = addSupportingDocument(await this.require(tenantId, id), document);
    await this.repository.save(leave);
    return leave;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Leave> {
    return this.require(tenantId, id);
  }

  async listForPerson(tenantId: TenantId, personId: Uuid): Promise<Leave[]> {
    return this.repository.listByPerson(tenantId, personId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Leave[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Leave> {
    const leave = await this.repository.findById(tenantId, id);
    if (!leave) {
      throw new LeaveNotFoundError(id);
    }
    return leave;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
