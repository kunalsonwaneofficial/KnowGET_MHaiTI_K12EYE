import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CommunicationChannel,
  Family,
  FamilyAddress,
  FamilyRepository,
  FamilyStatus,
  HouseholdMember,
} from "@knowget/family-guardian";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface FamilyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  familyNumber: string;
  name: string;
  members: unknown;
  primaryContactPersonId: string | null;
  addresses: unknown;
  preferredLanguage: string | null;
  preferredChannel: string | null;
  status: string;
  mergedIntoFamilyId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: FamilyRow): Family {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    familyNumber: row.familyNumber,
    name: row.name,
    members: (row.members as HouseholdMember[]) ?? [],
    primaryContactPersonId: (row.primaryContactPersonId as Uuid | null) ?? null,
    addresses: (row.addresses as FamilyAddress[]) ?? [],
    preferredLanguage: row.preferredLanguage,
    preferredChannel: (row.preferredChannel as CommunicationChannel | null) ?? null,
    status: row.status as FamilyStatus,
    mergedIntoFamilyId: (row.mergedIntoFamilyId as Uuid | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(family: Family) {
  return {
    tenantId: family.tenantId,
    organizationId: family.organizationId,
    familyNumber: family.familyNumber,
    name: family.name,
    members: JSON.parse(JSON.stringify(family.members)),
    primaryContactPersonId: family.primaryContactPersonId,
    addresses: JSON.parse(JSON.stringify(family.addresses)),
    preferredLanguage: family.preferredLanguage,
    preferredChannel: family.preferredChannel,
    status: family.status,
    mergedIntoFamilyId: family.mergedIntoFamilyId,
  };
}

/** Prisma-backed {@link FamilyRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaFamilyRepository implements FamilyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Family | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.family.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByFamilyNumber(tenantId: TenantId, familyNumber: string): Promise<Family | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.family.findFirst({ where: { familyNumber, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Family[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.family.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Family[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.family.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(family: Family): Promise<void> {
    return withTenant(this.db, family.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(family);
      await tx.family.upsert({
        where: { id: family.id },
        create: { id: family.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.family.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
