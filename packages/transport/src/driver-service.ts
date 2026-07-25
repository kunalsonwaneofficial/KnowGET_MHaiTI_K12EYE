import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  deactivateDriver,
  type Driver,
  type RegisterDriverParams,
  registerDriver,
  reinstateDriver,
  renewLicense,
  setLicenseClass,
  suspendDriver,
} from "./driver";
import {
  DriverNotFoundError,
  DuplicateDriverForEmployeeError,
  DuplicateLicenseNumberError,
  EmployeeNotFoundForTransportError,
} from "./errors";
import type { DriverRepository, EmployeeDirectory } from "./ports";
import {
  driverDeactivated,
  driverRegistered,
  driverReinstated,
  driverSuspended,
} from "./transport-events";

/** The service register input — the organization is derived from the employee, not supplied. */
export type RegisterDriverInput = Omit<RegisterDriverParams, "organizationId">;

export interface DriverServiceDeps {
  readonly repository: DriverRepository;
  readonly employees: EmployeeDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for drivers. Registers a driver against an employee (deriving the organization
 * from the employee, and enforcing a unique licence and one driver per employee), renews the licence,
 * and drives the `active ↔ suspended` / `→ deactivated` lifecycle, publishing the driver events.
 */
export class DriverService {
  private readonly repository: DriverRepository;
  private readonly employees: EmployeeDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: DriverServiceDeps) {
    this.repository = deps.repository;
    this.employees = deps.employees;
    this.events = deps.events;
  }

  async register(input: RegisterDriverInput): Promise<Driver> {
    const organizationId = await this.employees.organizationOf(input.tenantId, input.employeeId);
    if (organizationId === null) {
      throw new EmployeeNotFoundForTransportError(input.employeeId);
    }
    if (await this.repository.findByLicense(input.tenantId, input.licenseNumber.trim())) {
      throw new DuplicateLicenseNumberError(input.licenseNumber.trim());
    }
    if (await this.repository.findByEmployee(input.tenantId, input.employeeId)) {
      throw new DuplicateDriverForEmployeeError(input.employeeId);
    }
    const driver = registerDriver({ ...input, organizationId });
    await this.repository.save(driver);
    await this.emit(driverRegistered(driver));
    return driver;
  }

  async renewLicense(
    tenantId: TenantId,
    id: Uuid,
    licenseExpiry: string,
    licenseNumber?: string,
  ): Promise<Driver> {
    if (licenseNumber !== undefined) {
      const existing = await this.repository.findByLicense(tenantId, licenseNumber.trim());
      if (existing && existing.id !== id) {
        throw new DuplicateLicenseNumberError(licenseNumber.trim());
      }
    }
    return this.mutate(tenantId, id, (d) => renewLicense(d, licenseExpiry, licenseNumber));
  }

  async setLicenseClass(
    tenantId: TenantId,
    id: Uuid,
    licenseClass: string | null,
  ): Promise<Driver> {
    return this.mutate(tenantId, id, (d) => setLicenseClass(d, licenseClass));
  }

  async suspend(tenantId: TenantId, id: Uuid): Promise<Driver> {
    const updated = suspendDriver(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(driverSuspended(updated));
    return updated;
  }

  async reinstate(tenantId: TenantId, id: Uuid): Promise<Driver> {
    const updated = reinstateDriver(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(driverReinstated(updated));
    return updated;
  }

  async deactivate(tenantId: TenantId, id: Uuid): Promise<Driver> {
    const updated = deactivateDriver(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(driverDeactivated(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Driver> {
    return this.require(tenantId, id);
  }

  async getByLicense(tenantId: TenantId, licenseNumber: string): Promise<Driver> {
    const driver = await this.repository.findByLicense(tenantId, licenseNumber);
    if (!driver) {
      throw new DriverNotFoundError(licenseNumber);
    }
    return driver;
  }

  async list(tenantId: TenantId): Promise<Driver[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Driver[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (driver: Driver) => Driver,
  ): Promise<Driver> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Driver> {
    const driver = await this.repository.findById(tenantId, id);
    if (!driver) {
      throw new DriverNotFoundError(id);
    }
    return driver;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
