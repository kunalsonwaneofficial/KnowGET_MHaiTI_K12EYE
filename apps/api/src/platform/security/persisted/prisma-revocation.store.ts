import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { TenantId } from "@knowget/types";
import type { RevocationKind, RevocationRef, RevocationStore } from "./revocation-store";

/**
 * Prisma-backed {@link RevocationStore}. Records and lookups run inside
 * {@link withTenant} so PostgreSQL RLS scopes them to the caller's tenant.
 * Re-revoking the same reference is idempotent (unique on tenant + kind + ref).
 */
export class PrismaRevocationStore implements RevocationStore {
  constructor(private readonly db: PrismaService) {}

  revoke(tenantId: TenantId, kind: RevocationKind, ref: string): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.securityRevocation.upsert({
        where: { tenantId_kind_ref: { tenantId, kind, ref } },
        create: { tenantId, kind, ref },
        update: {},
      });
    });
  }

  isRevoked(tenantId: TenantId, ref: RevocationRef): Promise<boolean> {
    const targets: { kind: RevocationKind; ref: string }[] = [];
    if (ref.tokenId !== undefined) {
      targets.push({ kind: "token", ref: ref.tokenId });
    }
    if (ref.familyId !== undefined) {
      targets.push({ kind: "family", ref: ref.familyId });
    }
    if (targets.length === 0) {
      return Promise.resolve(false);
    }
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const count = await tx.securityRevocation.count({ where: { OR: targets } });
      return count > 0;
    });
  }
}
