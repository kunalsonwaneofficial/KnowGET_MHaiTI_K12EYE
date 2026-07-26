import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type Clinician,
  type RegisterClinicianParams,
  registerClinician,
  reinstateClinician,
  relieveClinician,
  setClinicianRole,
  setRegistrationNumber,
  suspendClinician,
} from "./clinician";
import {
  clinicianRegistered,
  clinicianRegistrationSet,
  clinicianReinstated,
  clinicianRelieved,
  clinicianRoleSet,
  clinicianSuspended,
} from "./health-centre-events";
import type { ClinicianRole } from "./health-centre-value";
import {
  ClinicianNotFoundError,
  DuplicateClinicianForEmployeeError,
  EmployeeNotFoundForHealthCentreError,
} from "./errors";
import type { ClinicianRepository, EmployeeDirectory } from "./ports";

/** The service register input — the organization is derived from the employee, not supplied. */
export type RegisterClinicianInput = Omit<RegisterClinicianParams, "organizationId">;

export interface ClinicianServiceDeps {
  readonly repository: ClinicianRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for clinicians. Registers a clinician against an employee (deriving the organization
 * from the employee, and enforcing one clinician per employee), edits the role and registration number,
 * and drives the `active ↔ suspended` / `→ relieved` lifecycle, publishing the clinician events.
 */
export class ClinicianService {
  private readonly repository: ClinicianRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ClinicianServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async register(input: RegisterClinicianInput): Promise<Clinician> {
    const organizationId = await this.employees.organizationOf(input.tenantId, input.employeeId);
    if (organizationId === null) {
      throw new EmployeeNotFoundForHealthCentreError(input.employeeId);
    }
    if (await this.repository.findByEmployee(input.tenantId, input.employeeId)) {
      throw new DuplicateClinicianForEmployeeError(input.employeeId);
    }
    const clinician = registerClinician({ ...input, organizationId });
    await this.repository.save(clinician);
    await this.emit(clinicianRegistered(clinician));
    return clinician;
  }

  async setRole(tenantId: TenantId, id: Uuid, role: ClinicianRole): Promise<Clinician> {
    const updated = setClinicianRole(await this.require(tenantId, id), role);
    await this.repository.save(updated);
    await this.emit(clinicianRoleSet(updated));
    return updated;
  }

  async setRegistration(
    tenantId: TenantId,
    id: Uuid,
    registrationNumber: string | null,
  ): Promise<Clinician> {
    const updated = setRegistrationNumber(await this.require(tenantId, id), registrationNumber);
    await this.repository.save(updated);
    await this.emit(clinicianRegistrationSet(updated));
    return updated;
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<Clinician> {
    const updated = suspendClinician(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(clinicianSuspended(updated));
    return updated;
  }

  async reinstate(tenantId: TenantId, id: Uuid): Promise<Clinician> {
    const updated = reinstateClinician(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(clinicianReinstated(updated));
    return updated;
  }

  async relieve(tenantId: TenantId, id: Uuid): Promise<Clinician> {
    const updated = relieveClinician(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(clinicianRelieved(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Clinician> {
    return this.require(tenantId, id);
  }

  async getByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Clinician | null> {
    return this.repository.findByEmployee(tenantId, employeeId);
  }

  async list(tenantId: TenantId): Promise<Clinician[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Clinician[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Clinician> {
    const clinician = await this.repository.findById(tenantId, id);
    if (!clinician) {
      throw new ClinicianNotFoundError(id);
    }
    return clinician;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
