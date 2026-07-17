import type { Identity, LoginIdentifierType } from "./identity";

/** Storage contract for identities (in-memory default; DB-backed in Phase 2). */
export interface IdentityRepository {
  findById(id: string): Promise<Identity | null>;
  findByIdentifier(type: LoginIdentifierType, value: string): Promise<Identity | null>;
  save(identity: Identity): Promise<void>;
}

export class InMemoryIdentityRepository implements IdentityRepository {
  private readonly byId = new Map<string, Identity>();

  async findById(id: string): Promise<Identity | null> {
    return this.byId.get(id) ?? null;
  }

  async findByIdentifier(type: LoginIdentifierType, value: string): Promise<Identity | null> {
    for (const identity of this.byId.values()) {
      if (identity.identifiers.some((i) => i.type === type && i.value === value)) {
        return identity;
      }
    }
    return null;
  }

  async save(identity: Identity): Promise<void> {
    this.byId.set(identity.id, identity);
  }
}
