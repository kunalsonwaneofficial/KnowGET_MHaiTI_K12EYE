import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { CoachingSession, CoachingSessionRepository } from "@knowget/faculty-excellence";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CoachingSessionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  engagementId: string;
  sessionDate: string;
  focus: string | null;
  notes: string | null;
  nextSteps: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CoachingSessionRow): CoachingSession {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    engagementId: row.engagementId as Uuid,
    sessionDate: row.sessionDate,
    focus: row.focus,
    notes: row.notes,
    nextSteps: row.nextSteps,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(session: CoachingSession) {
  return {
    tenantId: session.tenantId,
    organizationId: session.organizationId,
    engagementId: session.engagementId,
    sessionDate: session.sessionDate,
    focus: session.focus,
    notes: session.notes,
    nextSteps: session.nextSteps,
  };
}

/** Prisma-backed {@link CoachingSessionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCoachingSessionRepository implements CoachingSessionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CoachingSession | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.coachingSession.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByEngagement(tenantId: TenantId, engagementId: Uuid): Promise<CoachingSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.coachingSession.findMany({ where: { engagementId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CoachingSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.coachingSession.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(session: CoachingSession): Promise<void> {
    return withTenant(this.db, session.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(session);
      await tx.coachingSession.upsert({
        where: { id: session.id },
        create: { id: session.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.coachingSession.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
