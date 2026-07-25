import type { TenantId, Uuid } from "@knowget/types";
import type { Driver } from "./driver";
import type { Vehicle } from "./vehicle";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the
 * tenant? Vehicles, routes and trips attach to it; the transport domain links to it and never depends on
 * `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): a driver is an Employee. `exists` answers presence;
 * `organizationOf` resolves the employee's organization (or `null` if unknown) so a driver derives its
 * organization from the staff member it links to. The transport domain links to workforce and never
 * depends on `@knowget/workforce` directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/** Storage contract for fleet vehicles. Tenant-scoped (explicit argument + RLS). */
export interface VehicleRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Vehicle | null>;
  findByRegistration(tenantId: TenantId, registrationNumber: string): Promise<Vehicle | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Vehicle[]>;
  listByTenant(tenantId: TenantId): Promise<Vehicle[]>;
  save(vehicle: Vehicle): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link VehicleRepository} — the default for tests and bootstrap. */
export class InMemoryVehicleRepository implements VehicleRepository {
  private readonly byId = new Map<string, Vehicle>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Vehicle | null> {
    const vehicle = this.byId.get(id);
    return vehicle && vehicle.tenantId === tenantId ? vehicle : null;
  }

  async findByRegistration(
    tenantId: TenantId,
    registrationNumber: string,
  ): Promise<Vehicle | null> {
    return (
      [...this.byId.values()].find(
        (v) => v.tenantId === tenantId && v.registrationNumber === registrationNumber,
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Vehicle[]> {
    return [...this.byId.values()].filter(
      (v) => v.tenantId === tenantId && v.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Vehicle[]> {
    return [...this.byId.values()].filter((v) => v.tenantId === tenantId);
  }

  async save(vehicle: Vehicle): Promise<void> {
    this.byId.set(vehicle.id, vehicle);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const vehicle = this.byId.get(id);
    if (vehicle && vehicle.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for drivers. Tenant-scoped (explicit argument + RLS). */
export interface DriverRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Driver | null>;
  findByLicense(tenantId: TenantId, licenseNumber: string): Promise<Driver | null>;
  findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Driver | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Driver[]>;
  listByTenant(tenantId: TenantId): Promise<Driver[]>;
  save(driver: Driver): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link DriverRepository} — the default for tests and bootstrap. */
export class InMemoryDriverRepository implements DriverRepository {
  private readonly byId = new Map<string, Driver>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Driver | null> {
    const driver = this.byId.get(id);
    return driver && driver.tenantId === tenantId ? driver : null;
  }

  async findByLicense(tenantId: TenantId, licenseNumber: string): Promise<Driver | null> {
    return (
      [...this.byId.values()].find(
        (d) => d.tenantId === tenantId && d.licenseNumber === licenseNumber,
      ) ?? null
    );
  }

  async findByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<Driver | null> {
    return (
      [...this.byId.values()].find((d) => d.tenantId === tenantId && d.employeeId === employeeId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Driver[]> {
    return [...this.byId.values()].filter(
      (d) => d.tenantId === tenantId && d.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Driver[]> {
    return [...this.byId.values()].filter((d) => d.tenantId === tenantId);
  }

  async save(driver: Driver): Promise<void> {
    this.byId.set(driver.id, driver);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const driver = this.byId.get(id);
    if (driver && driver.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
