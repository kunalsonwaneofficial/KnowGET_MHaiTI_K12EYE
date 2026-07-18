import type { IdentityAccount, IdentityAccountRepository } from "@knowget/enterprise-identity";
import type { Identity, IdentityRepository, LoginIdentifierType } from "@knowget/identity";
import type { TenantId, Uuid } from "@knowget/types";

/**
 * Bridges the persisted, tenant-scoped {@link IdentityAccountRepository} to the
 * Phase-1 {@link IdentityRepository} port that the frozen `AuthenticationEngine`
 * (P1-M04) reads and writes — the concrete connection between the enterprise
 * identity system-of-record and the authentication engine.
 *
 * Login is **tenant-qualified**: the tenant is resolved (e.g. from the sign-in
 * host/slug) before this adapter is constructed, so every lookup stays RLS-clean
 * and identifiers only need to be unique within a tenant. The engine's writes
 * (failed-attempt counters, lockout, credential rotation) are merged back onto
 * the account, preserving the person link and identifiers.
 */
export function tenantIdentityRepository(
  accounts: IdentityAccountRepository,
  tenantId: TenantId,
): IdentityRepository {
  return {
    async findById(id: string): Promise<Identity | null> {
      const account = await accounts.findById(tenantId, id as Uuid);
      return account ? toIdentity(account) : null;
    },

    async findByIdentifier(type: LoginIdentifierType, value: string): Promise<Identity | null> {
      const account = await accounts.findByIdentifier(tenantId, type, value);
      return account ? toIdentity(account) : null;
    },

    async save(identity: Identity): Promise<void> {
      const existing = await accounts.findById(tenantId, identity.id as Uuid);
      if (!existing) {
        return;
      }
      await accounts.save({
        ...existing,
        credentialHash: identity.credentialHash,
        status: identity.status,
        failedLoginAttempts: identity.failedLoginAttempts,
        lockedUntil: identity.lockedUntil,
        updatedAt: identity.updatedAt,
      });
    },
  };
}

/** Project the authentication-relevant view of an account (drops tenant/person). */
function toIdentity(account: IdentityAccount): Identity {
  return {
    id: account.id,
    identifiers: account.identifiers,
    credentialHash: account.credentialHash,
    status: account.status,
    failedLoginAttempts: account.failedLoginAttempts,
    lockedUntil: account.lockedUntil,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}
