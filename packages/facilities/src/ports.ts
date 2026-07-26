import type { TenantId, Uuid } from "@knowget/types";
import type { Building } from "./building";
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
