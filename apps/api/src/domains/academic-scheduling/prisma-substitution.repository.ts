import type {
  Substitution,
  SubstitutionRepository,
  SubstitutionStatus,
  SubstitutionType,
} from "@knowget/academic-scheduling";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SubstitutionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  scheduleSlotId: string;
  substitutionType: string;
  originalId: string;
  replacementId: string;
  reason: string | null;
  date: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SubstitutionRow): Substitution {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    scheduleSlotId: row.scheduleSlotId as Uuid,
    substitutionType: row.substitutionType as SubstitutionType,
    originalId: row.originalId as Uuid,
    replacementId: row.replacementId as Uuid,
    reason: row.reason,
    date: row.date,
    status: row.status as SubstitutionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(substitution: Substitution) {
  return {
    tenantId: substitution.tenantId,
    organizationId: substitution.organizationId,
    scheduleSlotId: substitution.scheduleSlotId,
    substitutionType: substitution.substitutionType,
    originalId: substitution.originalId,
    replacementId: substitution.replacementId,
    reason: substitution.reason,
    date: substitution.date,
    status: substitution.status,
  };
}

/** Prisma-backed {@link SubstitutionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSubstitutionRepository implements SubstitutionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Substitution | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.substitution.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySlot(tenantId: TenantId, scheduleSlotId: Uuid): Promise<Substitution[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.substitution.findMany({
        where: { scheduleSlotId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Substitution[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.substitution.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Substitution[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.substitution.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(substitution: Substitution): Promise<void> {
    return withTenant(this.db, substitution.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(substitution);
      await tx.substitution.upsert({
        where: { id: substitution.id },
        create: { id: substitution.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.substitution.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
