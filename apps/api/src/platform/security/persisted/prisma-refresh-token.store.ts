import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { TenantId } from "@knowget/types";
import type {
  NewRefreshToken,
  RefreshTokenRecord,
  RefreshTokenStatus,
  RefreshTokenStore,
} from "./refresh-token-store";

/** The persisted row shape (Prisma `SecurityRefreshToken`). Epoch-ms as BIGINT. */
interface RefreshRow {
  id: string;
  familyId: string;
  identityId: string;
  sessionId: string;
  tokenHash: string;
  status: string;
  issuedAt: bigint;
  expiresAt: bigint;
}

function toRecord(row: RefreshRow): RefreshTokenRecord {
  return {
    id: row.id,
    familyId: row.familyId,
    identityId: row.identityId,
    sessionId: row.sessionId,
    tokenHash: row.tokenHash,
    status: row.status as RefreshTokenStatus,
    issuedAt: Number(row.issuedAt),
    expiresAt: Number(row.expiresAt),
  };
}

/**
 * Prisma-backed {@link RefreshTokenStore}. Every operation runs inside
 * {@link withTenant} so PostgreSQL RLS scopes it to the caller's tenant. The
 * `(tenant_id, token_hash)` unique index makes a presented hash resolve to at most
 * one record.
 */
export class PrismaRefreshTokenStore implements RefreshTokenStore {
  constructor(private readonly db: PrismaService) {}

  save(tenantId: TenantId, token: NewRefreshToken): Promise<RefreshTokenRecord> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.securityRefreshToken.create({
        data: {
          tenantId,
          familyId: token.familyId,
          identityId: token.identityId,
          sessionId: token.sessionId,
          tokenHash: token.tokenHash,
          issuedAt: BigInt(token.issuedAt),
          expiresAt: BigInt(token.expiresAt),
        },
      });
      return toRecord(row);
    });
  }

  findByHash(tenantId: TenantId, tokenHash: string): Promise<RefreshTokenRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.securityRefreshToken.findFirst({ where: { tokenHash } });
      return row ? toRecord(row) : null;
    });
  }

  markRotated(tenantId: TenantId, id: string): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.securityRefreshToken.update({ where: { id }, data: { status: "rotated" } });
    });
  }
}
