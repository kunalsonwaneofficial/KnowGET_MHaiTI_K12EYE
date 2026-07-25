import type {
  AttendanceSession,
  AttendanceSessionRepository,
  SessionStatus,
  SessionType,
} from "@knowget/attendance-presence";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AttendanceSessionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  sessionType: string;
  title: string;
  date: string;
  scheduleSlotId: string | null;
  sectionId: string | null;
  subjectId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AttendanceSessionRow): AttendanceSession {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    sessionType: row.sessionType as SessionType,
    title: row.title,
    date: row.date,
    scheduleSlotId: (row.scheduleSlotId as Uuid | null) ?? null,
    sectionId: (row.sectionId as Uuid | null) ?? null,
    subjectId: (row.subjectId as Uuid | null) ?? null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status as SessionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(session: AttendanceSession) {
  return {
    tenantId: session.tenantId,
    organizationId: session.organizationId,
    sessionType: session.sessionType,
    title: session.title,
    date: session.date,
    scheduleSlotId: session.scheduleSlotId,
    sectionId: session.sectionId,
    subjectId: session.subjectId,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    status: session.status,
  };
}

/** Prisma-backed {@link AttendanceSessionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAttendanceSessionRepository implements AttendanceSessionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AttendanceSession | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.attendanceSession.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findBySlotAndDate(
    tenantId: TenantId,
    scheduleSlotId: Uuid,
    date: string,
  ): Promise<AttendanceSession | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.attendanceSession.findFirst({
        where: { scheduleSlotId, date, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AttendanceSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attendanceSession.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AttendanceSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attendanceSession.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(session: AttendanceSession): Promise<void> {
    return withTenant(this.db, session.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(session);
      await tx.attendanceSession.upsert({
        where: { id: session.id },
        create: { id: session.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.attendanceSession.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
