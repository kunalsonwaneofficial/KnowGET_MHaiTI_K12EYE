import type { EngagementProfile, EngagementProfileRepository } from "@knowget/engagement";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EngagementProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  audienceId: string;
  audienceCode: string;
  audienceName: string;
  audienceSize: number;
  announcementCount: number;
  totalAcknowledged: number;
  acknowledgementPercent: number;
  surveyCount: number;
  totalResponses: number;
  responsePercent: number;
  refreshedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EngagementProfileRow): EngagementProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    audienceId: row.audienceId as Uuid,
    audienceCode: row.audienceCode,
    audienceName: row.audienceName,
    audienceSize: row.audienceSize,
    announcementCount: row.announcementCount,
    totalAcknowledged: row.totalAcknowledged,
    acknowledgementPercent: row.acknowledgementPercent,
    surveyCount: row.surveyCount,
    totalResponses: row.totalResponses,
    responsePercent: row.responsePercent,
    refreshedAt: row.refreshedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: EngagementProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    audienceId: profile.audienceId,
    audienceCode: profile.audienceCode,
    audienceName: profile.audienceName,
    audienceSize: profile.audienceSize,
    announcementCount: profile.announcementCount,
    totalAcknowledged: profile.totalAcknowledged,
    acknowledgementPercent: profile.acknowledgementPercent,
    surveyCount: profile.surveyCount,
    totalResponses: profile.totalResponses,
    responsePercent: profile.responsePercent,
    refreshedAt: profile.refreshedAt,
  };
}

/** Prisma-backed {@link EngagementProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEngagementProfileRepository implements EngagementProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EngagementProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.engagementProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByAudience(tenantId: TenantId, audienceId: Uuid): Promise<EngagementProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.engagementProfile.findFirst({ where: { audienceId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<EngagementProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.engagementProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EngagementProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.engagementProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: EngagementProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.engagementProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.engagementProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
