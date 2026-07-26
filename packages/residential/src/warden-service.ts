import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  DuplicateWardenForEmployeeError,
  EmployeeNotFoundForResidentialError,
  WardenNotFoundError,
} from "./errors";
import type { EmployeeDirectory, WardenRepository } from "./ports";
import {
  wardenRegistered,
  wardenReinstated,
  wardenRelieved,
  wardenSuspended,
} from "./residential-events";
import {
  type RegisterWardenParams,
  registerWarden,
  reinstateWarden,
  relieveWarden,
  setWardenRole,
  suspendWarden,
  type Warden,
} from "./warden";
import type { WardenRole } from "./residential-value";

/** The service register input — the organization is derived from the employee, not supplied. */
export type RegisterWardenInput = Omit<RegisterWardenParams, "organizationId">;

export interface WardenServiceDeps {
  readonly repository: WardenRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for wardens. Registers a warden against an employee (deriving the organization from
 * the employee, and enforcing one warden per employee), edits the role, and drives the
 * `active ↔ suspended` / `→ relieved` lifecycle, publishing the warden events.
 */
export class WardenService {
  private readonly repository: WardenRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: WardenServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async register(input: RegisterWardenInput): Promise<Warden> {
    const organizationId = await this.employees.organizationOf(input.tenantId, input.employeeId);
    if (organizationId === null) {
      throw new EmployeeNotFoundForResidentialError(input.employeeId);
    }
    if (await this.repository.findByEmployee(input.tenantId, input.employeeId)) {
      throw new DuplicateWardenForEmployeeError(input.employeeId);
    }
    const warden = registerWarden({ ...input, organizationId });
    await this.repository.save(warden);
    await this.emit(wardenRegistered(warden));
    return warden;
  }

  async setRole(tenantId: TenantId, id: Uuid, role: WardenRole): Promise<Warden> {
    return this.mutate(tenantId, id, (w) => setWardenRole(w, role));
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<Warden> {
    const updated = suspendWarden(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(wardenSuspended(updated));
    return updated;
  }

  async reinstate(tenantId: TenantId, id: Uuid): Promise<Warden> {
    const updated = reinstateWarden(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(wardenReinstated(updated));
    return updated;
  }

  async relieve(tenantId: TenantId, id: Uuid): Promise<Warden> {
    const updated = relieveWarden(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(wardenRelieved(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Warden> {
    return this.require(tenantId, id);
  }

  async getByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Warden | null> {
    return this.repository.findByEmployee(tenantId, employeeId);
  }

  async list(tenantId: TenantId): Promise<Warden[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Warden[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (warden: Warden) => Warden,
  ): Promise<Warden> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Warden> {
    const warden = await this.repository.findById(tenantId, id);
    if (!warden) {
      throw new WardenNotFoundError(id);
    }
    return warden;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
