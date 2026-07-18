import type { TenantId, Uuid } from "@knowget/types";
import type { IdentityAccount } from "./identity-account";
import { identifierKey, type LoginIdentifier, type LoginIdentifierType } from "./identifier";

/**
 * Storage contract for identity accounts. Tenant-scoped (explicit argument + RLS
 * in the adapter). `findByIdentifier` is tenant-scoped by design: login is
 * tenant-qualified (the tenant is resolved — e.g. from the sign-in host/slug —
 * before the identifier is looked up), which keeps every query RLS-clean.
 */
export interface IdentityAccountRepository {
  findById(tenantId: TenantId, id: Uuid): Promise<IdentityAccount | null>;
  findByPersonId(tenantId: TenantId, personId: Uuid): Promise<IdentityAccount[]>;
  findByIdentifier(
    tenantId: TenantId,
    type: LoginIdentifierType,
    value: string,
  ): Promise<IdentityAccount | null>;
  listByTenant(tenantId: TenantId): Promise<IdentityAccount[]>;
  save(account: IdentityAccount): Promise<void>;
  remove(tenantId: TenantId, id: Uuid): Promise<void>;
}

/**
 * Hashes a plaintext credential for storage. Injected so the domain stays free
 * of crypto (and Prisma); the API wires it to `@knowget/security`.
 */
export interface CredentialHasher {
  hash(plaintext: string): string;
}

/**
 * Read model over the person domain: does this person exist in the tenant? Lets
 * the identity service enforce the Person↔account link without depending on the
 * `@knowget/person` package directly.
 */
export interface PersonDirectory {
  exists(tenantId: TenantId, personId: Uuid): Promise<boolean>;
}

/** In-memory {@link IdentityAccountRepository} — the default for tests and bootstrap. */
export class InMemoryIdentityAccountRepository implements IdentityAccountRepository {
  private readonly byId = new Map<string, IdentityAccount>();

  async findById(tenantId: TenantId, id: Uuid): Promise<IdentityAccount | null> {
    const account = this.byId.get(id);
    return account && account.tenantId === tenantId ? account : null;
  }

  async findByPersonId(tenantId: TenantId, personId: Uuid): Promise<IdentityAccount[]> {
    return [...this.byId.values()].filter(
      (a) => a.tenantId === tenantId && a.personId === personId,
    );
  }

  async findByIdentifier(
    tenantId: TenantId,
    type: LoginIdentifierType,
    value: string,
  ): Promise<IdentityAccount | null> {
    const wanted = identifierKey({ type, value } satisfies LoginIdentifier);
    for (const account of this.byId.values()) {
      if (account.tenantId !== tenantId) {
        continue;
      }
      if (account.identifiers.some((i) => identifierKey(i) === wanted)) {
        return account;
      }
    }
    return null;
  }

  async listByTenant(tenantId: TenantId): Promise<IdentityAccount[]> {
    return [...this.byId.values()].filter((a) => a.tenantId === tenantId);
  }

  async save(account: IdentityAccount): Promise<void> {
    this.byId.set(account.id, account);
  }

  async remove(tenantId: TenantId, id: Uuid): Promise<void> {
    const account = this.byId.get(id);
    if (account && account.tenantId === tenantId) {
      this.byId.delete(id);
    }
  }
}
