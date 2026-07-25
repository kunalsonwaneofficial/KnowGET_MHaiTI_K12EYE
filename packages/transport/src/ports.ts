import type { TenantId, Uuid } from "@knowget/types";
import type { Driver } from "./driver";
import type { Route } from "./route";
import type { TransportSubscription } from "./transport-subscription";
import type { Trip } from "./trip";
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

/**
 * Read model over the student-lifecycle domain (P2-D03): a transport subscription is for a Student.
 * `exists` answers presence; `organizationOf` resolves the student's organization so a subscription
 * derives its org from the student it serves. The transport domain links to student-lifecycle and never
 * depends on `@knowget/student-lifecycle` directly.
 */
export interface StudentDirectory {
  exists(tenantId: TenantId, studentId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, studentId: Uuid): Promise<Uuid | null>;
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

/** Storage contract for transport subscriptions. Tenant-scoped (explicit argument + RLS). */
export interface TransportSubscriptionRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<TransportSubscription | null>;
  findOpenByStudentAndRoute(
    tenantId: TenantId,
    studentId: Uuid,
    routeId: Uuid,
  ): Promise<TransportSubscription | null>;
  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<TransportSubscription[]>;
  listByRoute(tenantId: TenantId, routeId: Uuid): Promise<TransportSubscription[]>;
  listActiveByRoute(tenantId: TenantId, routeId: Uuid): Promise<TransportSubscription[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<TransportSubscription[]>;
  listByTenant(tenantId: TenantId): Promise<TransportSubscription[]>;
  save(subscription: TransportSubscription): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link TransportSubscriptionRepository} — the default for tests and bootstrap. */
export class InMemoryTransportSubscriptionRepository implements TransportSubscriptionRepository {
  private readonly byId = new Map<string, TransportSubscription>();

  async findById(tenantId: TenantId, id: Uuid): Promise<TransportSubscription | null> {
    const subscription = this.byId.get(id);
    return subscription && subscription.tenantId === tenantId ? subscription : null;
  }

  async findOpenByStudentAndRoute(
    tenantId: TenantId,
    studentId: Uuid,
    routeId: Uuid,
  ): Promise<TransportSubscription | null> {
    return (
      [...this.byId.values()].find(
        (s) =>
          s.tenantId === tenantId &&
          s.studentId === studentId &&
          s.routeId === routeId &&
          s.status !== "ended",
      ) ?? null
    );
  }

  async listByStudent(tenantId: TenantId, studentId: Uuid): Promise<TransportSubscription[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.studentId === studentId,
    );
  }

  async listByRoute(tenantId: TenantId, routeId: Uuid): Promise<TransportSubscription[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId && s.routeId === routeId);
  }

  async listActiveByRoute(tenantId: TenantId, routeId: Uuid): Promise<TransportSubscription[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.routeId === routeId && s.status === "active",
    );
  }

  async listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<TransportSubscription[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<TransportSubscription[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(subscription: TransportSubscription): Promise<void> {
    this.byId.set(subscription.id, subscription);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const subscription = this.byId.get(id);
    if (subscription && subscription.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for trips. Tenant-scoped (explicit argument + RLS). */
export interface TripRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Trip | null>;
  listByRoute(tenantId: TenantId, routeId: Uuid): Promise<Trip[]>;
  listByVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<Trip[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Trip[]>;
  listByTenant(tenantId: TenantId): Promise<Trip[]>;
  save(trip: Trip): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link TripRepository} — the default for tests and bootstrap. */
export class InMemoryTripRepository implements TripRepository {
  private readonly byId = new Map<string, Trip>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Trip | null> {
    const trip = this.byId.get(id);
    return trip && trip.tenantId === tenantId ? trip : null;
  }

  async listByRoute(tenantId: TenantId, routeId: Uuid): Promise<Trip[]> {
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId && t.routeId === routeId);
  }

  async listByVehicle(tenantId: TenantId, vehicleId: Uuid): Promise<Trip[]> {
    return [...this.byId.values()].filter(
      (t) => t.tenantId === tenantId && t.vehicleId === vehicleId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Trip[]> {
    return [...this.byId.values()].filter(
      (t) => t.tenantId === tenantId && t.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Trip[]> {
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId);
  }

  async save(trip: Trip): Promise<void> {
    this.byId.set(trip.id, trip);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const trip = this.byId.get(id);
    if (trip && trip.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
