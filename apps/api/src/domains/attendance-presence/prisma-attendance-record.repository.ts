import type {
  AttendanceCorrection,
  AttendanceMethod,
  AttendanceRecord,
  AttendanceRecordRepository,
  AttendanceStatus,
  ParticipantType,
} from "@knowget/attendance-presence";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AttendanceRecordRow {
  id: string;
  tenantId: string;
  organizationId: string;
  sessionId: string;
  participantId: string;
  participantType: string;
  status: string;
  method: string;
  date: string;
  recordedAt: Date;
  recordedBy: string | null;
  remarks: string | null;
  corrections: unknown;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AttendanceRecordRow): AttendanceRecord {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    sessionId: row.sessionId as Uuid,
    participantId: row.participantId as Uuid,
    participantType: row.participantType as ParticipantType,
    status: row.status as AttendanceStatus,
    method: row.method as AttendanceMethod,
    date: row.date,
    recordedAt: toIso(row.recordedAt),
    recordedBy: (row.recordedBy as Uuid | null) ?? null,
    remarks: row.remarks,
    corrections: (row.corrections as AttendanceCorrection[]) ?? [],
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(record: AttendanceRecord) {
  return {
    tenantId: record.tenantId,
    organizationId: record.organizationId,
    sessionId: record.sessionId,
    participantId: record.participantId,
    participantType: record.participantType,
    status: record.status,
    method: record.method,
    date: record.date,
    recordedAt: new Date(record.recordedAt),
    recordedBy: record.recordedBy,
    remarks: record.remarks,
    corrections: JSON.parse(JSON.stringify(record.corrections)),
    version: record.version,
  };
}

/** Prisma-backed {@link AttendanceRecordRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAttendanceRecordRepository implements AttendanceRecordRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AttendanceRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.attendanceRecord.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findBySessionAndParticipant(
    tenantId: TenantId,
    sessionId: Uuid,
    participantId: Uuid,
  ): Promise<AttendanceRecord | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.attendanceRecord.findFirst({
        where: { sessionId, participantId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listBySession(tenantId: TenantId, sessionId: Uuid): Promise<AttendanceRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attendanceRecord.findMany({ where: { sessionId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByParticipant(tenantId: TenantId, participantId: Uuid): Promise<AttendanceRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attendanceRecord.findMany({
        where: { participantId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AttendanceRecord[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attendanceRecord.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(record: AttendanceRecord): Promise<void> {
    return withTenant(this.db, record.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(record);
      await tx.attendanceRecord.upsert({
        where: { id: record.id },
        create: { id: record.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.attendanceRecord.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
