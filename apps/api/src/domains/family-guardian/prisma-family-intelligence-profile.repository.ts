import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  FamilyIntelligenceIndicators,
  FamilyIntelligenceProfile,
  FamilyIntelligenceProfileRepository,
  FamilyInteraction,
} from "@knowget/family-guardian";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface IntelligenceProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  familyId: string;
  indicators: unknown;
  interactions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: IntelligenceProfileRow): FamilyIntelligenceProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    familyId: row.familyId as Uuid,
    indicators: row.indicators as FamilyIntelligenceIndicators,
    interactions: (row.interactions as FamilyInteraction[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: FamilyIntelligenceProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    familyId: profile.familyId,
    indicators: JSON.parse(JSON.stringify(profile.indicators)),
    interactions: JSON.parse(JSON.stringify(profile.interactions)),
  };
}

/** Prisma-backed {@link FamilyIntelligenceProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaFamilyIntelligenceProfileRepository implements FamilyIntelligenceProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<FamilyIntelligenceProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.familyIntelligenceProfile.findFirst({
        where: { id, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findByFamily(tenantId: TenantId, familyId: Uuid): Promise<FamilyIntelligenceProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.familyIntelligenceProfile.findFirst({
        where: { familyId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<FamilyIntelligenceProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.familyIntelligenceProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<FamilyIntelligenceProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.familyIntelligenceProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: FamilyIntelligenceProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.familyIntelligenceProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.familyIntelligenceProfile.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }
}
