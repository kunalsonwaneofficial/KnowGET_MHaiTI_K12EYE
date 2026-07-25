import type {
  ActivityType,
  EngagementLevel,
  Participation,
  ParticipationRepository,
} from "@knowget/attendance-presence";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ParticipationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  participantId: string;
  activityType: string;
  activityName: string;
  date: string;
  sessionId: string | null;
  role: string | null;
  engagementLevel: string | null;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ParticipationRow): Participation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    participantId: row.participantId as Uuid,
    activityType: row.activityType as ActivityType,
    activityName: row.activityName,
    date: row.date,
    sessionId: (row.sessionId as Uuid | null) ?? null,
    role: row.role,
    engagementLevel: (row.engagementLevel as EngagementLevel | null) ?? null,
    remarks: row.remarks,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(participation: Participation) {
  return {
    tenantId: participation.tenantId,
    organizationId: participation.organizationId,
    participantId: participation.participantId,
    activityType: participation.activityType,
    activityName: participation.activityName,
    date: participation.date,
    sessionId: participation.sessionId,
    role: participation.role,
    engagementLevel: participation.engagementLevel,
    remarks: participation.remarks,
  };
}

/** Prisma-backed {@link ParticipationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaParticipationRepository implements ParticipationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Participation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.participation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByParticipant(tenantId: TenantId, participantId: Uuid): Promise<Participation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.participation.findMany({ where: { participantId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Participation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.participation.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Participation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.participation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(participation: Participation): Promise<void> {
    return withTenant(this.db, participation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(participation);
      await tx.participation.upsert({
        where: { id: participation.id },
        create: { id: participation.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.participation.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
