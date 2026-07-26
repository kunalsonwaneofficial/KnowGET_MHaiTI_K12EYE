import type { TenantId, Uuid } from "@knowget/types";
import type { EntityType } from "./entity-type";
import type { RelationshipType } from "./relationship-type";

/**
 * Read model over the organization domain (P2-D01-M01): does this organization node exist in the tenant? Every
 * ontology and graph record attaches to it; the domain links to it and never depends on `@knowget/organization`.
 */
export interface OrganizationDirectory {
  exists(tenantId: TenantId, organizationId: Uuid): Promise<boolean>;
}

/**
 * Storage contract for ontology entity types. Tenant-scoped (explicit argument + RLS). `findByKey` backs the
 * one-type-per-key rule and the relationship-type endpoint validation.
 */
export interface EntityTypeRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<EntityType | null>;
  findByKey(tenantId: TenantId, key: string): Promise<EntityType | null>;
  listByTenant(tenantId: TenantId): Promise<EntityType[]>;
  save(type: EntityType): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link EntityTypeRepository} — the default for tests and bootstrap. */
export class InMemoryEntityTypeRepository implements EntityTypeRepository {
  private readonly byId = new Map<string, EntityType>();

  async findById(tenantId: TenantId, id: Uuid): Promise<EntityType | null> {
    const type = this.byId.get(id);
    return type && type.tenantId === tenantId ? type : null;
  }

  async findByKey(tenantId: TenantId, key: string): Promise<EntityType | null> {
    return [...this.byId.values()].find((t) => t.tenantId === tenantId && t.key === key) ?? null;
  }

  async listByTenant(tenantId: TenantId): Promise<EntityType[]> {
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId);
  }

  async save(type: EntityType): Promise<void> {
    this.byId.set(type.id, type);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const type = this.byId.get(id);
    if (type && type.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}

/**
 * Storage contract for ontology relationship types. Tenant-scoped (explicit argument + RLS). `findByKey` backs
 * the one-type-per-key rule and the relationship's type validation.
 */
export interface RelationshipTypeRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<RelationshipType | null>;
  findByKey(tenantId: TenantId, key: string): Promise<RelationshipType | null>;
  listByTenant(tenantId: TenantId): Promise<RelationshipType[]>;
  save(type: RelationshipType): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** In-memory {@link RelationshipTypeRepository} — the default for tests and bootstrap. */
export class InMemoryRelationshipTypeRepository implements RelationshipTypeRepository {
  private readonly byId = new Map<string, RelationshipType>();

  async findById(tenantId: TenantId, id: Uuid): Promise<RelationshipType | null> {
    const type = this.byId.get(id);
    return type && type.tenantId === tenantId ? type : null;
  }

  async findByKey(tenantId: TenantId, key: string): Promise<RelationshipType | null> {
    return [...this.byId.values()].find((t) => t.tenantId === tenantId && t.key === key) ?? null;
  }

  async listByTenant(tenantId: TenantId): Promise<RelationshipType[]> {
    return [...this.byId.values()].filter((t) => t.tenantId === tenantId);
  }

  async save(type: RelationshipType): Promise<void> {
    this.byId.set(type.id, type);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const type = this.byId.get(id);
    if (type && type.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
