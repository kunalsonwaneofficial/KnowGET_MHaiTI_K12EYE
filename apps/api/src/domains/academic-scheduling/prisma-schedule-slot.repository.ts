import type {
  ScheduleSlot,
  ScheduleSlotRepository,
  TimeOfDay,
  Weekday,
} from "@knowget/academic-scheduling";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ScheduleSlotRow {
  id: string;
  tenantId: string;
  organizationId: string;
  timetableId: string;
  dayOfWeek: string;
  startsAt: string;
  endsAt: string;
  subjectId: string;
  teacherId: string;
  classId: string | null;
  sectionId: string;
  venueId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ScheduleSlotRow): ScheduleSlot {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    timetableId: row.timetableId as Uuid,
    dayOfWeek: row.dayOfWeek as Weekday,
    startsAt: row.startsAt as TimeOfDay,
    endsAt: row.endsAt as TimeOfDay,
    subjectId: row.subjectId as Uuid,
    teacherId: row.teacherId as Uuid,
    classId: (row.classId as Uuid | null) ?? null,
    sectionId: row.sectionId as Uuid,
    venueId: (row.venueId as Uuid | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(slot: ScheduleSlot) {
  return {
    tenantId: slot.tenantId,
    organizationId: slot.organizationId,
    timetableId: slot.timetableId,
    dayOfWeek: slot.dayOfWeek,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    subjectId: slot.subjectId,
    teacherId: slot.teacherId,
    classId: slot.classId,
    sectionId: slot.sectionId,
    venueId: slot.venueId,
  };
}

/** Prisma-backed {@link ScheduleSlotRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaScheduleSlotRepository implements ScheduleSlotRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ScheduleSlot | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.scheduleSlot.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByPlacement(
    tenantId: TenantId,
    timetableId: Uuid,
    dayOfWeek: string,
    startsAt: string,
    sectionId: Uuid,
  ): Promise<ScheduleSlot | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.scheduleSlot.findFirst({
        where: { timetableId, dayOfWeek, startsAt, sectionId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByTimetable(tenantId: TenantId, timetableId: Uuid): Promise<ScheduleSlot[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.scheduleSlot.findMany({ where: { timetableId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ScheduleSlot[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.scheduleSlot.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(slot: ScheduleSlot): Promise<void> {
    return withTenant(this.db, slot.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(slot);
      await tx.scheduleSlot.upsert({
        where: { id: slot.id },
        create: { id: slot.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.scheduleSlot.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
