import type { TenantId, Uuid } from "@knowget/types";
import type { Building } from "./building";
import type { ComfortPolicy } from "./comfort-policy";
import type { EnvironmentReading } from "./environment-reading";
import type { FacilityProfile } from "./facility-profile";
import type { FacilitySystem } from "./facility-system";
import type { MaintenanceOrder } from "./maintenance-order";
import type { Sensor } from "./sensor";
import type { Space } from "./space";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant?
 * Buildings, systems and sensors attach to it; the domain links to it and never depends on
 * `@knowget/organization` directly.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Read model over the workforce domain (P2-D12): a work-order assignee is an Employee. `exists` answers
 * presence; `organizationOf` resolves the employee's organization (or `null` if unknown). The domain links
 * to workforce and never depends on `@knowget/workforce` directly.
 */
export interface EmployeeDirectory {
  exists(tenantId: TenantId, employeeId: Uuid): Promise<boolean>;
  organizationOf(tenantId: TenantId, employeeId: Uuid): Promise<Uuid | null>;
}

/** Storage contract for buildings. Tenant-scoped (explicit argument + RLS). */
export interface BuildingRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Building | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Building | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Building[]>;
  listByTenant(tenantId: TenantId): Promise<Building[]>;
  save(building: Building): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link BuildingRepository} — the default for tests and bootstrap. */
export class InMemoryBuildingRepository implements BuildingRepository {
  private readonly byId = new Map<string, Building>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Building | null> {
    const building = this.byId.get(id);
    return building && building.tenantId === tenantId ? building : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Building | null> {
    return [...this.byId.values()].find((b) => b.tenantId === tenantId && b.code === code) ?? null;
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Building[]> {
    return [...this.byId.values()].filter(
      (b) => b.tenantId === tenantId && b.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Building[]> {
    return [...this.byId.values()].filter((b) => b.tenantId === tenantId);
  }

  async save(building: Building): Promise<void> {
    this.byId.set(building.id, building);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const building = this.byId.get(id);
    if (building && building.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for spaces. Tenant-scoped (explicit argument + RLS). */
export interface SpaceRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Space | null>;
  findByCodeInBuilding(tenantId: TenantId, buildingId: Uuid, code: string): Promise<Space | null>;
  listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<Space[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Space[]>;
  listByTenant(tenantId: TenantId): Promise<Space[]>;
  save(space: Space): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link SpaceRepository} — the default for tests and bootstrap. */
export class InMemorySpaceRepository implements SpaceRepository {
  private readonly byId = new Map<string, Space>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Space | null> {
    const space = this.byId.get(id);
    return space && space.tenantId === tenantId ? space : null;
  }

  async findByCodeInBuilding(
    tenantId: TenantId,
    buildingId: Uuid,
    code: string,
  ): Promise<Space | null> {
    return (
      [...this.byId.values()].find(
        (s) => s.tenantId === tenantId && s.buildingId === buildingId && s.code === code,
      ) ?? null
    );
  }

  async listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<Space[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.buildingId === buildingId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Space[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Space[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(space: Space): Promise<void> {
    this.byId.set(space.id, space);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const space = this.byId.get(id);
    if (space && space.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for facility systems. Tenant-scoped (explicit argument + RLS). */
export interface FacilitySystemRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<FacilitySystem | null>;
  findByCodeInBuilding(
    tenantId: TenantId,
    buildingId: Uuid,
    code: string,
  ): Promise<FacilitySystem | null>;
  listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<FacilitySystem[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacilitySystem[]>;
  listByTenant(tenantId: TenantId): Promise<FacilitySystem[]>;
  save(system: FacilitySystem): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link FacilitySystemRepository} — the default for tests and bootstrap. */
export class InMemoryFacilitySystemRepository implements FacilitySystemRepository {
  private readonly byId = new Map<string, FacilitySystem>();

  async findById(tenantId: TenantId, id: Uuid): Promise<FacilitySystem | null> {
    const system = this.byId.get(id);
    return system && system.tenantId === tenantId ? system : null;
  }

  async findByCodeInBuilding(
    tenantId: TenantId,
    buildingId: Uuid,
    code: string,
  ): Promise<FacilitySystem | null> {
    return (
      [...this.byId.values()].find(
        (s) => s.tenantId === tenantId && s.buildingId === buildingId && s.code === code,
      ) ?? null
    );
  }

  async listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<FacilitySystem[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.buildingId === buildingId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacilitySystem[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<FacilitySystem[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(system: FacilitySystem): Promise<void> {
    this.byId.set(system.id, system);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const system = this.byId.get(id);
    if (system && system.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for sensors. Tenant-scoped (explicit argument + RLS). */
export interface SensorRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Sensor | null>;
  findByCode(tenantId: TenantId, code: string): Promise<Sensor | null>;
  findActiveBySpaceAndMetric(
    tenantId: TenantId,
    spaceId: Uuid,
    metric: string,
  ): Promise<Sensor | null>;
  listBySpace(tenantId: TenantId, spaceId: Uuid): Promise<Sensor[]>;
  listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<Sensor[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Sensor[]>;
  listByTenant(tenantId: TenantId): Promise<Sensor[]>;
  save(sensor: Sensor): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link SensorRepository} — the default for tests and bootstrap. */
export class InMemorySensorRepository implements SensorRepository {
  private readonly byId = new Map<string, Sensor>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Sensor | null> {
    const sensor = this.byId.get(id);
    return sensor && sensor.tenantId === tenantId ? sensor : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<Sensor | null> {
    return [...this.byId.values()].find((s) => s.tenantId === tenantId && s.code === code) ?? null;
  }

  async findActiveBySpaceAndMetric(
    tenantId: TenantId,
    spaceId: Uuid,
    metric: string,
  ): Promise<Sensor | null> {
    return (
      [...this.byId.values()].find(
        (s) =>
          s.tenantId === tenantId &&
          s.spaceId === spaceId &&
          s.metric === metric &&
          s.status === "active",
      ) ?? null
    );
  }

  async listBySpace(tenantId: TenantId, spaceId: Uuid): Promise<Sensor[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId && s.spaceId === spaceId);
  }

  async listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<Sensor[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.buildingId === buildingId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Sensor[]> {
    return [...this.byId.values()].filter(
      (s) => s.tenantId === tenantId && s.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Sensor[]> {
    return [...this.byId.values()].filter((s) => s.tenantId === tenantId);
  }

  async save(sensor: Sensor): Promise<void> {
    this.byId.set(sensor.id, sensor);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const sensor = this.byId.get(id);
    if (sensor && sensor.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for environment readings — an append-only telemetry log. Tenant-scoped (explicit
 * argument + RLS). There is no `remove`: readings are immutable facts. `latestBySpace` returns the most
 * recent reading per metric in a space — exactly what the comfort engine consumes.
 */
export interface EnvironmentReadingRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EnvironmentReading | null>;
  listBySpace(tenantId: TenantId, spaceId: Uuid): Promise<EnvironmentReading[]>;
  listBySensor(tenantId: TenantId, sensorId: Uuid): Promise<EnvironmentReading[]>;
  latestBySpace(tenantId: TenantId, spaceId: Uuid): Promise<EnvironmentReading[]>;
  listByTenant(tenantId: TenantId): Promise<EnvironmentReading[]>;
  save(reading: EnvironmentReading): Promise<void>;
}

/** In-memory {@link EnvironmentReadingRepository} — the default for tests and bootstrap. */
export class InMemoryEnvironmentReadingRepository implements EnvironmentReadingRepository {
  private readonly byId = new Map<string, EnvironmentReading>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EnvironmentReading | null> {
    const reading = this.byId.get(id);
    return reading && reading.tenantId === tenantId ? reading : null;
  }

  async listBySpace(tenantId: TenantId, spaceId: Uuid): Promise<EnvironmentReading[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId && r.spaceId === spaceId);
  }

  async listBySensor(tenantId: TenantId, sensorId: Uuid): Promise<EnvironmentReading[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && r.sensorId === sensorId,
    );
  }

  async latestBySpace(tenantId: TenantId, spaceId: Uuid): Promise<EnvironmentReading[]> {
    const latest = new Map<string, EnvironmentReading>();
    for (const reading of await this.listBySpace(tenantId, spaceId)) {
      const held = latest.get(reading.metric);
      if (!held || reading.recordedAt > held.recordedAt) {
        latest.set(reading.metric, reading);
      }
    }
    return [...latest.values()];
  }

  async listByTenant(tenantId: TenantId): Promise<EnvironmentReading[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(reading: EnvironmentReading): Promise<void> {
    this.byId.set(reading.id, reading);
  }
}

/** Storage contract for maintenance orders. Tenant-scoped (explicit argument + RLS). */
export interface MaintenanceOrderRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<MaintenanceOrder | null>;
  findByCode(tenantId: TenantId, code: string): Promise<MaintenanceOrder | null>;
  listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<MaintenanceOrder[]>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MaintenanceOrder[]>;
  listByAssignee(tenantId: TenantId, assigneeId: Uuid): Promise<MaintenanceOrder[]>;
  listOpen(tenantId: TenantId): Promise<MaintenanceOrder[]>;
  listByTenant(tenantId: TenantId): Promise<MaintenanceOrder[]>;
  save(order: MaintenanceOrder): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

const OPEN_MAINTENANCE = new Set<string>(["reported", "assigned", "in_progress"]);

/** In-memory {@link MaintenanceOrderRepository} — the default for tests and bootstrap. */
export class InMemoryMaintenanceOrderRepository implements MaintenanceOrderRepository {
  private readonly byId = new Map<string, MaintenanceOrder>();

  async findById(tenantId: TenantId, id: Uuid): Promise<MaintenanceOrder | null> {
    const order = this.byId.get(id);
    return order && order.tenantId === tenantId ? order : null;
  }

  async findByCode(tenantId: TenantId, code: string): Promise<MaintenanceOrder | null> {
    return [...this.byId.values()].find((o) => o.tenantId === tenantId && o.code === code) ?? null;
  }

  async listByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<MaintenanceOrder[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.buildingId === buildingId,
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MaintenanceOrder[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.organizationId === organizationId,
    );
  }

  async listByAssignee(tenantId: TenantId, assigneeId: Uuid): Promise<MaintenanceOrder[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && o.assigneeId === assigneeId,
    );
  }

  async listOpen(tenantId: TenantId): Promise<MaintenanceOrder[]> {
    return [...this.byId.values()].filter(
      (o) => o.tenantId === tenantId && OPEN_MAINTENANCE.has(o.status),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<MaintenanceOrder[]> {
    return [...this.byId.values()].filter((o) => o.tenantId === tenantId);
  }

  async save(order: MaintenanceOrder): Promise<void> {
    this.byId.set(order.id, order);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const order = this.byId.get(id);
    if (order && order.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for comfort policies. Tenant-scoped (explicit argument + RLS). `findActiveByOrganization`
 * resolves the single active policy the comfort engine measures against (or `null`).
 */
export interface ComfortPolicyRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<ComfortPolicy | null>;
  findActiveByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ComfortPolicy | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ComfortPolicy[]>;
  listByTenant(tenantId: TenantId): Promise<ComfortPolicy[]>;
  save(policy: ComfortPolicy): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link ComfortPolicyRepository} — the default for tests and bootstrap. */
export class InMemoryComfortPolicyRepository implements ComfortPolicyRepository {
  private readonly byId = new Map<string, ComfortPolicy>();

  async findById(tenantId: TenantId, id: Uuid): Promise<ComfortPolicy | null> {
    const policy = this.byId.get(id);
    return policy && policy.tenantId === tenantId ? policy : null;
  }

  async findActiveByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<ComfortPolicy | null> {
    return (
      [...this.byId.values()].find(
        (p) =>
          p.tenantId === tenantId && p.organizationId === organizationId && p.status === "active",
      ) ?? null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ComfortPolicy[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<ComfortPolicy[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(policy: ComfortPolicy): Promise<void> {
    this.byId.set(policy.id, policy);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const policy = this.byId.get(id);
    if (policy && policy.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/** Storage contract for facility profiles — one per building. Tenant-scoped (explicit argument + RLS). */
export interface FacilityProfileRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<FacilityProfile | null>;
  findByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<FacilityProfile | null>;
  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacilityProfile[]>;
  listByTenant(tenantId: TenantId): Promise<FacilityProfile[]>;
  save(profile: FacilityProfile): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link FacilityProfileRepository} — the default for tests and bootstrap. */
export class InMemoryFacilityProfileRepository implements FacilityProfileRepository {
  private readonly byId = new Map<string, FacilityProfile>();

  async findById(tenantId: TenantId, id: Uuid): Promise<FacilityProfile | null> {
    const profile = this.byId.get(id);
    return profile && profile.tenantId === tenantId ? profile : null;
  }

  async findByBuilding(tenantId: TenantId, buildingId: Uuid): Promise<FacilityProfile | null> {
    return (
      [...this.byId.values()].find((p) => p.tenantId === tenantId && p.buildingId === buildingId) ??
      null
    );
  }

  async listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FacilityProfile[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && p.organizationId === organizationId,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<FacilityProfile[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(profile: FacilityProfile): Promise<void> {
    this.byId.set(profile.id, profile);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const profile = this.byId.get(id);
    if (profile && profile.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
