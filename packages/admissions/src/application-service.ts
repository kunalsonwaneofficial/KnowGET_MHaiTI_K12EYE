import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isCycleOpen } from "./admission-cycle";
import {
  type Application,
  type CreateApplicationParams,
  createApplication,
  offerApplication,
  rejectApplication,
  scheduleApplicationInterview,
  startApplicationReview,
  waitlistApplication,
  withdrawApplication,
} from "./application";
import {
  applicationInterviewScheduled,
  applicationOffered,
  applicationRejected,
  applicationReviewStarted,
  applicationSubmitted,
  applicationWaitlisted,
  applicationWithdrawn,
} from "./admissions-events";
import {
  ApplicationNotFoundError,
  CycleNotFoundError,
  CycleNotOpenError,
  DuplicateApplicationCodeError,
  LeadNotFoundForApplicationError,
  PersonNotFoundForAdmissionsError,
} from "./errors";
import type {
  AdmissionCycleRepository,
  ApplicationRepository,
  LeadRepository,
  PersonDirectory,
} from "./ports";

/** The submit input — the organization is derived from the target cycle, not supplied. */
export type SubmitApplicationInput = Omit<CreateApplicationParams, "organizationId">;

export interface ApplicationServiceDeps {
  readonly repository: ApplicationRepository;
  readonly cycles: AdmissionCycleRepository;
  readonly leads: LeadRepository;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for admission applications. Submits an application (validating an open target cycle, an
 * existing applicant Person, and deriving the organization from the cycle), and drives the review workflow
 * `submitted → under_review → interview → offered` with `waitlisted`/`rejected`/`withdrawn` branches,
 * publishing the application events. An offer (a separate aggregate) is extended once an application reaches
 * `offered`.
 */
export class ApplicationService {
  private readonly repository: ApplicationRepository;
  private readonly cycles: AdmissionCycleRepository;
  private readonly leads: LeadRepository;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ApplicationServiceDeps) {
    this.repository = deps.repository;
    this.cycles = deps.cycles;
    this.leads = deps.leads;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async submit(input: SubmitApplicationInput): Promise<Application> {
    const cycle = await this.cycles.findById(input.tenantId, input.cycleId);
    if (!cycle) {
      throw new CycleNotFoundError(input.cycleId);
    }
    if (!isCycleOpen(cycle)) {
      throw new CycleNotOpenError(input.cycleId);
    }
    if (!(await this.persons.exists(input.tenantId, input.applicantPersonId))) {
      throw new PersonNotFoundForAdmissionsError(input.applicantPersonId);
    }
    if (input.leadId && !(await this.leads.findById(input.tenantId, input.leadId))) {
      throw new LeadNotFoundForApplicationError(input.leadId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateApplicationCodeError(input.code.trim());
    }
    const application = createApplication({ ...input, organizationId: cycle.organizationId });
    await this.repository.save(application);
    await this.emit(applicationSubmitted(application));
    return application;
  }

  async startReview(tenantId: TenantId, id: Uuid): Promise<Application> {
    const updated = startApplicationReview(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(applicationReviewStarted(updated));
    return updated;
  }

  async scheduleInterview(tenantId: TenantId, id: Uuid): Promise<Application> {
    const updated = scheduleApplicationInterview(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(applicationInterviewScheduled(updated));
    return updated;
  }

  async offer(tenantId: TenantId, id: Uuid, decidedOn: string): Promise<Application> {
    const updated = offerApplication(await this.require(tenantId, id), decidedOn);
    await this.repository.save(updated);
    await this.emit(applicationOffered(updated));
    return updated;
  }

  async waitlist(tenantId: TenantId, id: Uuid, decidedOn: string): Promise<Application> {
    const updated = waitlistApplication(await this.require(tenantId, id), decidedOn);
    await this.repository.save(updated);
    await this.emit(applicationWaitlisted(updated));
    return updated;
  }

  async reject(tenantId: TenantId, id: Uuid, decidedOn: string): Promise<Application> {
    const updated = rejectApplication(await this.require(tenantId, id), decidedOn);
    await this.repository.save(updated);
    await this.emit(applicationRejected(updated));
    return updated;
  }

  async withdraw(tenantId: TenantId, id: Uuid, decidedOn: string): Promise<Application> {
    const updated = withdrawApplication(await this.require(tenantId, id), decidedOn);
    await this.repository.save(updated);
    await this.emit(applicationWithdrawn(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Application> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<Application> {
    const application = await this.repository.findByCode(tenantId, code);
    if (!application) {
      throw new ApplicationNotFoundError(code);
    }
    return application;
  }

  async listForCycle(tenantId: TenantId, cycleId: Uuid): Promise<Application[]> {
    return this.repository.listByCycle(tenantId, cycleId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Application[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Application> {
    const application = await this.repository.findById(tenantId, id);
    if (!application) {
      throw new ApplicationNotFoundError(id);
    }
    return application;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
