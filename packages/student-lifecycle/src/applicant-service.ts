import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  addRequiredDocument,
  type Applicant,
  approveApplication,
  beginReview,
  type DecideApplicationParams,
  rejectApplication,
  recordInterviewOutcome,
  type ScheduleInterviewParams,
  scheduleInterview,
  setDocumentStatus,
  type StartApplicationParams,
  startApplication,
  submitApplication,
  withdrawApplication,
} from "./applicant";
import type { DocumentStatus } from "./application-document";
import {
  ApplicantNotFoundError,
  OrganizationNotFoundForLifecycleError,
  PersonNotFoundForLifecycleError,
} from "./errors";
import type { ApplicantRepository, OrganizationDirectory, PersonDirectory } from "./ports";
import { applicantApproved, applicationSubmitted } from "./student-lifecycle-events";

export interface ApplicantServiceDeps {
  readonly repository: ApplicantRepository;
  readonly persons: PersonDirectory;
  readonly organizations: OrganizationDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for admissions applications. Starts applications (validating
 * the organization and the applicant's Person), manages the document checklist,
 * runs the evaluation lifecycle (submit → review → interview → decision), and
 * records the admission decision — publishing `student.application.submitted` and
 * `student.applicant.approved`.
 */
export class ApplicantService {
  private readonly repository: ApplicantRepository;
  private readonly persons: PersonDirectory;
  private readonly organizations: OrganizationDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ApplicantServiceDeps) {
    this.repository = deps.repository;
    this.persons = deps.persons;
    this.organizations = deps.organizations;
    this.events = deps.events;
  }

  async start(input: StartApplicationParams): Promise<Applicant> {
    await this.assertOrganizationExists(input.tenantId, input.organizationId);
    await this.assertPersonExists(input.tenantId, input.personId);
    const applicant = startApplication(input);
    await this.repository.save(applicant);
    return applicant;
  }

  async submit(tenantId: TenantId, id: Uuid): Promise<Applicant> {
    const updated = submitApplication(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(applicationSubmitted(updated));
    return updated;
  }

  async addDocument(tenantId: TenantId, id: Uuid, type: string): Promise<Applicant> {
    const updated = addRequiredDocument(await this.require(tenantId, id), type);
    await this.repository.save(updated);
    return updated;
  }

  async setDocumentStatus(
    tenantId: TenantId,
    id: Uuid,
    type: string,
    status: DocumentStatus,
  ): Promise<Applicant> {
    const updated = setDocumentStatus(await this.require(tenantId, id), type, status);
    await this.repository.save(updated);
    return updated;
  }

  async beginReview(tenantId: TenantId, id: Uuid): Promise<Applicant> {
    return this.mutate(tenantId, id, beginReview);
  }

  async scheduleInterview(
    tenantId: TenantId,
    id: Uuid,
    params: ScheduleInterviewParams,
  ): Promise<Applicant> {
    const updated = scheduleInterview(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async recordInterviewOutcome(tenantId: TenantId, id: Uuid, outcome: string): Promise<Applicant> {
    const updated = recordInterviewOutcome(await this.require(tenantId, id), outcome);
    await this.repository.save(updated);
    return updated;
  }

  async approve(
    tenantId: TenantId,
    id: Uuid,
    params: DecideApplicationParams = {},
  ): Promise<Applicant> {
    await this.assertDeciderExists(tenantId, params.decidedById);
    const updated = approveApplication(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    await this.emit(applicantApproved(updated));
    return updated;
  }

  async reject(
    tenantId: TenantId,
    id: Uuid,
    params: DecideApplicationParams = {},
  ): Promise<Applicant> {
    await this.assertDeciderExists(tenantId, params.decidedById);
    const updated = rejectApplication(await this.require(tenantId, id), params);
    await this.repository.save(updated);
    return updated;
  }

  async withdraw(tenantId: TenantId, id: Uuid): Promise<Applicant> {
    return this.mutate(tenantId, id, withdrawApplication);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Applicant> {
    return this.require(tenantId, id);
  }

  async list(tenantId: TenantId): Promise<Applicant[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Applicant[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (applicant: Applicant) => Applicant,
  ): Promise<Applicant> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async assertOrganizationExists(tenantId: TenantId, organizationId: Uuid): Promise<void> {
    if (!(await this.organizations.exists(tenantId, organizationId))) {
      throw new OrganizationNotFoundForLifecycleError(organizationId);
    }
  }

  private async assertPersonExists(tenantId: TenantId, personId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, personId))) {
      throw new PersonNotFoundForLifecycleError(personId);
    }
  }

  private async assertDeciderExists(tenantId: TenantId, decidedById?: Uuid | null): Promise<void> {
    if (decidedById !== undefined && decidedById !== null) {
      await this.assertPersonExists(tenantId, decidedById);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Applicant> {
    const applicant = await this.repository.findById(tenantId, id);
    if (!applicant) {
      throw new ApplicantNotFoundError(id);
    }
    return applicant;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
