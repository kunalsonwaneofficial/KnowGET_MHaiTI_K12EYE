import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  TimelineEntry,
  TimelineEntryType,
  TimelineRepository,
} from "@knowget/student-lifecycle";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface TimelineRow {
  id: string;
  tenantId: string;
  studentId: string;
  organizationId: string;
  type: string;
  occurredOn: Date;
  summary: string;
  detail: string | null;
  sourceEvent: string | null;
  recordedAt: Date;
}

function toDomain(row: TimelineRow): TimelineEntry {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    studentId: row.studentId as Uuid,
    organizationId: row.organizationId as Uuid,
    type: row.type as TimelineEntryType,
    occurredOn: row.occurredOn.toISOString().slice(0, 10),
    summary: row.summary,
    detail: row.detail,
    sourceEvent: row.sourceEvent,
    recordedAt: toIso(row.recordedAt) as ISODateString,
  };
}

/**
 * Prisma-backed {@link TimelineRepository} (RLS via {@link withTenant}). Append-only:
 * `save` inserts a new immutable entry; there is no update or delete.
 */
export class PrismaStudentTimelineRepository implements TimelineRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<TimelineEntry | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentTimelineEntry.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<TimelineEntry[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentTimelineEntry.findMany({ where: { studentId } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<TimelineEntry[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentTimelineEntry.findMany({ where: { organizationId } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<TimelineEntry[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentTimelineEntry.findMany();
      return rows.map(toDomain);
    });
  }

  save(entry: TimelineEntry): Promise<void> {
    return withTenant(this.db, entry.tenantId, async (tx: TransactionClient) => {
      await tx.studentTimelineEntry.create({
        data: {
          id: entry.id,
          tenantId: entry.tenantId,
          studentId: entry.studentId,
          organizationId: entry.organizationId,
          type: entry.type,
          occurredOn: new Date(entry.occurredOn),
          summary: entry.summary,
          detail: entry.detail,
          sourceEvent: entry.sourceEvent,
          recordedAt: new Date(entry.recordedAt),
        },
      });
    });
  }
}
