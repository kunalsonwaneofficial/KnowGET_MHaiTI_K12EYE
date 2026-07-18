import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type IdentityAccount,
  type IdentityAccountRepository,
  identifierKey,
  identifierKeys,
  type IdentityStatus,
  type LoginIdentifier,
  type LoginIdentifierType,
} from "@knowget/enterprise-identity";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/** The database row shape (Prisma model fields) for an identity account. */
interface IdentityAccountRow {
  id: string;
  tenantId: string;
  personId: string;
  identifiers: unknown;
  credentialHash: string | null;
  status: string;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: IdentityAccountRow): IdentityAccount {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    personId: row.personId as Uuid,
    identifiers: (row.identifiers as LoginIdentifier[] | null) ?? [],
    credentialHash: row.credentialHash,
    status: row.status as IdentityStatus,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil ? toIso(row.lockedUntil) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Persisted (Prisma) fields for an identity account. The return type is inferred
 * (not `Record<string, unknown>`) so the concrete field types satisfy Prisma's
 * typed create/update input. `identifier_keys` is the normalized, GIN-indexed
 * lookup array; identifiers persist as JSONB. */
function toFields(account: IdentityAccount) {
  return {
    tenantId: account.tenantId,
    personId: account.personId,
    // Plain JSON (strips branding); assignable to Prisma's Json input.
    identifiers: JSON.parse(JSON.stringify(account.identifiers)),
    identifierKeys: identifierKeys(account.identifiers),
    credentialHash: account.credentialHash,
    status: account.status,
    failedLoginAttempts: account.failedLoginAttempts,
    lockedUntil: account.lockedUntil ? new Date(account.lockedUntil) : null,
  };
}

/**
 * Prisma-backed {@link IdentityAccountRepository}. Every operation runs inside
 * {@link withTenant} so PostgreSQL RLS scopes the query to the caller's tenant
 * (defense-in-depth with the explicit tenant argument). Identifiers persist as
 * JSONB; identifier resolution matches the normalized `identifier_keys` array
 * (GIN-indexed). Deletes are soft; reads exclude soft-deleted rows.
 */
export class PrismaIdentityAccountRepository implements IdentityAccountRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<IdentityAccount | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.identityAccount.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByPersonId(tenantId: TenantId, personId: Uuid): Promise<IdentityAccount[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.identityAccount.findMany({ where: { personId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  findByIdentifier(
    tenantId: TenantId,
    type: LoginIdentifierType,
    value: string,
  ): Promise<IdentityAccount | null> {
    const key = identifierKey({ type, value });
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.identityAccount.findFirst({
        where: { identifierKeys: { has: key }, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<IdentityAccount[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.identityAccount.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(account: IdentityAccount): Promise<void> {
    return withTenant(this.db, account.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(account);
      await tx.identityAccount.upsert({
        where: { id: account.id },
        create: { id: account.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.identityAccount.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
