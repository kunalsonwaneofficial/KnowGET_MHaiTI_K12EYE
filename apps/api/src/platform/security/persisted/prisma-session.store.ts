import type { Session } from "@knowget/authentication";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { TenantId } from "@knowget/types";
import type { SessionStore } from "./session-store";

/** The persisted row shape (Prisma `SecuritySession`). Timestamps are epoch-ms
 * stored as BIGINT to preserve the frozen numeric `Session` contract. */
interface SessionRow {
  id: string;
  identityId: string;
  createdAt: bigint;
  lastActivityAt: bigint;
  expiresAt: bigint;
  device: string | null;
  revoked: boolean;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    identityId: row.identityId,
    createdAt: Number(row.createdAt),
    lastActivityAt: Number(row.lastActivityAt),
    expiresAt: Number(row.expiresAt),
    device: row.device,
    revoked: row.revoked,
  };
}

/** Persisted (Prisma) fields for a session. Epoch-ms numbers are widened to
 * BigInt at this boundary. */
function toFields(tenantId: TenantId, session: Session) {
  return {
    tenantId,
    identityId: session.identityId,
    createdAt: BigInt(session.createdAt),
    lastActivityAt: BigInt(session.lastActivityAt),
    expiresAt: BigInt(session.expiresAt),
    device: session.device,
    revoked: session.revoked,
  };
}

/**
 * Prisma-backed {@link SessionStore}. Every operation runs inside
 * {@link withTenant} so PostgreSQL RLS scopes the query to the caller's tenant
 * (defense-in-depth with the explicit tenant argument). The session `id` is the
 * opaque session token (a natural TEXT primary key, not a UUID).
 */
export class PrismaSessionStore implements SessionStore {
  constructor(private readonly db: PrismaService) {}

  create(tenantId: TenantId, session: Session): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.securitySession.create({
        data: { id: session.id, ...toFields(tenantId, session) },
      });
    });
  }

  findById(tenantId: TenantId, id: string): Promise<Session | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.securitySession.findFirst({ where: { id } });
      return row ? toSession(row) : null;
    });
  }

  findByIdentity(tenantId: TenantId, identityId: string): Promise<Session[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.securitySession.findMany({ where: { identityId } });
      return rows.map(toSession);
    });
  }

  update(tenantId: TenantId, session: Session): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.securitySession.update({
        where: { id: session.id },
        data: toFields(tenantId, session),
      });
    });
  }
}
