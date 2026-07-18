import type { TenantId, Uuid } from "@knowget/types";
import type { Relationship } from "./relationship";

/**
 * Storage contract for relationships. Tenant-scoped (explicit argument + RLS in
 * the adapter). `findByPerson` returns every edge touching a person (as `from`
 * or `to`); `findBetween` returns edges between a pair (either direction), which
 * powers the duplicate guard.
 */
export interface RelationshipRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Relationship | null>;
  findByPerson(tenantId: TenantId, personId: Uuid): Promise<Relationship[]>;
  findBetween(tenantId: TenantId, personA: Uuid, personB: Uuid): Promise<Relationship[]>;
  listByTenant(tenantId: TenantId): Promise<Relationship[]>;
  save(relationship: Relationship): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/** Read model over the person domain: does this person exist in the tenant? */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** In-memory {@link RelationshipRepository} — the default for tests and bootstrap. */
export class InMemoryRelationshipRepository implements RelationshipRepository {
  private readonly byId = new Map<string, Relationship>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Relationship | null> {
    const relationship = this.byId.get(id);
    return relationship && relationship.tenantId === tenantId ? relationship : null;
  }

  async findByPerson(tenantId: TenantId, personId: Uuid): Promise<Relationship[]> {
    return [...this.byId.values()].filter(
      (r) => r.tenantId === tenantId && (r.fromPersonId === personId || r.toPersonId === personId),
    );
  }

  async findBetween(tenantId: TenantId, personA: Uuid, personB: Uuid): Promise<Relationship[]> {
    return [...this.byId.values()].filter(
      (r) =>
        r.tenantId === tenantId &&
        ((r.fromPersonId === personA && r.toPersonId === personB) ||
          (r.fromPersonId === personB && r.toPersonId === personA)),
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Relationship[]> {
    return [...this.byId.values()].filter((r) => r.tenantId === tenantId);
  }

  async save(relationship: Relationship): Promise<void> {
    this.byId.set(relationship.id, relationship);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const relationship = this.byId.get(id);
    if (relationship && relationship.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
