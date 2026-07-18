import type { TenantId, Uuid } from "@knowget/types";
import { matchKey } from "./matching";
import type { Person } from "./person";

/**
 * Storage contract for people. Tenant-scoped (explicit argument + RLS in the
 * adapter). `findByMatchKey` powers duplicate detection; the adapter queries an
 * indexed `match_key` column while the in-memory default computes it on the fly.
 */
export interface PersonRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<Person | null>;
  findByMatchKey(tenantId: TenantId, key: string): Promise<Person[]>;
  listByTenant(tenantId: TenantId): Promise<Person[]>;
  save(person: Person): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

export class InMemoryPersonRepository implements PersonRepository {
  private readonly byId = new Map<string, Person>();

  async findById(tenantId: TenantId, id: Uuid): Promise<Person | null> {
    const person = this.byId.get(id);
    return person && person.tenantId === tenantId ? person : null;
  }

  async findByMatchKey(tenantId: TenantId, key: string): Promise<Person[]> {
    return [...this.byId.values()].filter(
      (p) => p.tenantId === tenantId && matchKey(p.name, p.dateOfBirth) === key,
    );
  }

  async listByTenant(tenantId: TenantId): Promise<Person[]> {
    return [...this.byId.values()].filter((p) => p.tenantId === tenantId);
  }

  async save(person: Person): Promise<void> {
    this.byId.set(person.id, person);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const person = this.byId.get(id);
    if (person && person.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
