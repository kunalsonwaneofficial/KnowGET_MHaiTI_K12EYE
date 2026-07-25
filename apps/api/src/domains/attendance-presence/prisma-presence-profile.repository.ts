import type { PresenceProfile, PresenceProfileRepository } from "@knowget/attendance-presence";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface PresenceProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  participantId: string;
  attendancePercentage: number;
  punctualityRate: number;
  longestAbsentStreak: number;
  chronicAbsenteeism: boolean;
  participationCount: number;
  participationDiversity: number;
  leaveCount: number;
  engagementScore: number;
  riskLevel: string;
  anomalies: unknown;
  lastComputedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PresenceProfileRow): PresenceProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    participantId: row.participantId as Uuid,
    attendancePercentage: row.attendancePercentage,
    punctualityRate: row.punctualityRate,
    longestAbsentStreak: row.longestAbsentStreak,
    chronicAbsenteeism: row.chronicAbsenteeism,
    participationCount: row.participationCount,
    participationDiversity: row.participationDiversity,
    leaveCount: row.leaveCount,
    engagementScore: row.engagementScore,
    riskLevel: row.riskLevel as PresenceProfile["riskLevel"],
    anomalies: (row.anomalies as string[]) ?? [],
    lastComputedAt: row.lastComputedAt ? toIso(row.lastComputedAt) : null,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: PresenceProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    participantId: profile.participantId,
    attendancePercentage: profile.attendancePercentage,
    punctualityRate: profile.punctualityRate,
    longestAbsentStreak: profile.longestAbsentStreak,
    chronicAbsenteeism: profile.chronicAbsenteeism,
    participationCount: profile.participationCount,
    participationDiversity: profile.participationDiversity,
    leaveCount: profile.leaveCount,
    engagementScore: profile.engagementScore,
    riskLevel: profile.riskLevel,
    anomalies: JSON.parse(JSON.stringify(profile.anomalies)),
    lastComputedAt: profile.lastComputedAt ? new Date(profile.lastComputedAt) : null,
    version: profile.version,
  };
}

/** Prisma-backed {@link PresenceProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPresenceProfileRepository implements PresenceProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<PresenceProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.presenceProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByParticipant(tenantId: TenantId, participantId: Uuid): Promise<PresenceProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.presenceProfile.findFirst({
        where: { participantId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<PresenceProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.presenceProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<PresenceProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.presenceProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: PresenceProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.presenceProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.presenceProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
