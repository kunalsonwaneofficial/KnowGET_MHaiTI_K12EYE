import type { TenantId, Uuid } from "@knowget/types";
import type { Driver } from "./driver";
import type { Route } from "./route";
import type { Vehicle } from "./vehicle";
import type { VehicleAssignment } from "./vehicle-assignment";

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

/** Storage contract for routes. Tenant-scoped (explicit argument + RLS). */
export interface RouteRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Route | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Route | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Route[]>;
  listByTenant(tenantId: TenantId): Promise<Route[]>;
  save(route: Route): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link RouteRepository} — the default for tests and bootstrap. */
export class InMemoryRouteRepository implements RouteRepository {
  private readonly byId = new Map<string, Route>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Route | null> {
    const route = this.byId.get(id);
    return route && route.tenantId === tenantId ? route : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Route | null> {
    return [...this.byId.values()].find((r) => r.tenantId === tenantId && r.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Route[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Route[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(route: Route): Promise<void> {
    this.byId.set(route.id, route);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const route = this.byId.get(id);
    if (route && route.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for vehicle assignments. Tenant-scoped (explicit argument + RLS). */
export interface VehicleAssignmentRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<VehicleAssignment | null>;
  findActiveByRoute(tenantId: TenantId, routeId: Uuid): Promise<VehicleAssignment | null>;
  listByRoute(tenantId: TenantId, routeId: Uuid): Promise<VehicleAssignment[]>;
  listByVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<VehicleAssignment[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<VehicleAssignment[]>;
  listByTenant(tenantId: TenantId): Promise<VehicleAssignment[]>;
  save(assignment: VehicleAssignment): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link VehicleAssignmentRepository} — the default for tests and bootstrap. */
export class InMemoryVehicleAssignmentRepository implements VehicleAssignmentRepository {
  private readonly byId = new Map<string, VehicleAssignment>();

  async findById(tenantId: TenantId, id: Uuid): Promise<VehicleAssignment | null> {
    const assignment = this.byId.get(id);
    return assignment && assignment.tenantId === tenantId ? assignment : null;
  }

  async findActiveByRoute(tenantId: TenantId, routeId: Uuid): Promise<VehicleAssignment | null> {
    return (
      [...this.byId.values()].find(
        (a) => a.tenantId === tenantId && a.routeId === routeId && a.status === "active",
      ) ?? null
    );
  }

  async listByRoute(tenantId: TenantId, routeId: Uuid): Promise<VehicleAssignment[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId && a.routeId === routeId);
  }

  async listByVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<VehicleAssignment[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.vehicleId === vehicleId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<VehicleAssignment[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<VehicleAssignment[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(assignment: VehicleAssignment): Promise<void> {
    this.byId.set(assignment.id, assignment);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const assignment = this.byId.get(id);
    if (assignment && assignment.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
