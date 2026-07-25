import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CoachingEngagement,
  CoachingEngagementRepository,
  EngagementStatus,
} from "@knowget/faculty-excellence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CoachingEngagementRow {
  id: string;
  tenantId: string;
  organizationId: string;
  coachId: string;
  coacheeId: string;
  focus: string;
  frameworkId: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CoachingEngagementRow): CoachingEngagement {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    coachId: row.coachId as Uuid,
    coacheeId: row.coacheeId as Uuid,
    focus: row.focus,
    frameworkId: (row.frameworkId as Uuid | null) ?? null,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status as EngagementStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(engagement: CoachingEngagement) {
  return {
    tenantId: engagement.tenantId,
    organizationId: engagement.organizationId,
    coachId: engagement.coachId,
    coacheeId: engagement.coacheeId,
    focus: engagement.focus,
    frameworkId: engagement.frameworkId,
    startDate: engagement.startDate,
    endDate: engagement.endDate,
    status: engagement.status,
  };
}

/** Prisma-backed {@link CoachingEngagementRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCoachingEngagementRepository implements CoachingEngagementRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CoachingEngagement | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.coachingEngagement.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByCoachee(tenantId: TenantId, coacheeId: Uuid): Promise<CoachingEngagement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.coachingEngagement.findMany({ where: { coacheeId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByCoach(tenantId: TenantId, coachId: Uuid): Promise<CoachingEngagement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.coachingEngagement.findMany({ where: { coachId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CoachingEngagement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.coachingEngagement.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CoachingEngagement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.coachingEngagement.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(engagement: CoachingEngagement): Promise<void> {
    return withTenant(this.db, engagement.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(engagement);
      await tx.coachingEngagement.upsert({
        where: { id: engagement.id },
        create: { id: engagement.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.coachingEngagement.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
