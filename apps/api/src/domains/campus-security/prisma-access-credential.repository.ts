import type {
  AccessCredential,
  AccessCredentialRepository,
  CredentialHolderType,
  CredentialStatus,
} from "@knowget/campus-security";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AccessCredentialRow {
  id: string;
  tenantId: string;
  organizationId: string;
  credentialNumber: string;
  holderType: string;
  holderId: string;
  grantedZoneIds: unknown;
  issuedOn: string;
  expiresOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AccessCredentialRow): AccessCredential {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    credentialNumber: row.credentialNumber,
    holderType: row.holderType as CredentialHolderType,
    holderId: row.holderId as Uuid,
    grantedZoneIds: (row.grantedZoneIds as Uuid[] | null) ?? [],
    issuedOn: row.issuedOn,
    expiresOn: row.expiresOn,
    status: row.status as CredentialStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(credential: AccessCredential) {
  return {
    tenantId: credential.tenantId,
    organizationId: credential.organizationId,
    credentialNumber: credential.credentialNumber,
    holderType: credential.holderType,
    holderId: credential.holderId,
    // Serialize to a plain JSON value for the JSONB column.
    grantedZoneIds: JSON.parse(JSON.stringify(credential.grantedZoneIds)),
    issuedOn: credential.issuedOn,
    expiresOn: credential.expiresOn,
    status: credential.status,
  };
}

/** Prisma-backed {@link AccessCredentialRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAccessCredentialRepository implements AccessCredentialRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AccessCredential | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.accessCredential.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByNumber(tenantId: TenantId, credentialNumber: string): Promise<AccessCredential | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.accessCredential.findFirst({
        where: { credentialNumber, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByHolder(
    tenantId: TenantId,
    holderType: string,
    holderId: Uuid,
  ): Promise<AccessCredential[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessCredential.findMany({
        where: { holderType, holderId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listActiveByGrantedZone(tenantId: TenantId, zoneId: Uuid): Promise<AccessCredential[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessCredential.findMany({
        where: { status: "active", grantedZoneIds: { array_contains: zoneId }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AccessCredential[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessCredential.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AccessCredential[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessCredential.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(credential: AccessCredential): Promise<void> {
    return withTenant(this.db, credential.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(credential);
      await tx.accessCredential.upsert({
        where: { id: credential.id },
        create: { id: credential.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.accessCredential.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
