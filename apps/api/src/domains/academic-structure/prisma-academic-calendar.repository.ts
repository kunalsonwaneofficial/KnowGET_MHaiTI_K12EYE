import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AcademicCalendar,
  AcademicCalendarRepository,
  AcademicEvent,
  CalendarStatus,
  ExaminationPeriod,
  Holiday,
  Term,
  Weekday,
} from "@knowget/academic-structure";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AcademicCalendarRow {
  id: string;
  tenantId: string;
  organizationId: string;
  academicYear: string;
  startDate: string;
  endDate: string;
  status: string;
  terms: unknown;
  holidays: unknown;
  examinationPeriods: unknown;
  specialEvents: unknown;
  workingDays: string[];
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AcademicCalendarRow): AcademicCalendar {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    academicYear: row.academicYear,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status as CalendarStatus,
    terms: (row.terms as Term[]) ?? [],
    holidays: (row.holidays as Holiday[]) ?? [],
    examinationPeriods: (row.examinationPeriods as ExaminationPeriod[]) ?? [],
    specialEvents: (row.specialEvents as AcademicEvent[]) ?? [],
    workingDays: [...((row.workingDays as Weekday[]) ?? [])],
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(calendar: AcademicCalendar) {
  return {
    tenantId: calendar.tenantId,
    organizationId: calendar.organizationId,
    academicYear: calendar.academicYear,
    startDate: calendar.startDate,
    endDate: calendar.endDate,
    status: calendar.status,
    terms: JSON.parse(JSON.stringify(calendar.terms)),
    holidays: JSON.parse(JSON.stringify(calendar.holidays)),
    examinationPeriods: JSON.parse(JSON.stringify(calendar.examinationPeriods)),
    specialEvents: JSON.parse(JSON.stringify(calendar.specialEvents)),
    workingDays: [...calendar.workingDays],
    publishedAt: calendar.publishedAt ? new Date(calendar.publishedAt) : null,
  };
}

/** Prisma-backed {@link AcademicCalendarRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAcademicCalendarRepository implements AcademicCalendarRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AcademicCalendar | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicCalendar.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByYear(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
  ): Promise<AcademicCalendar | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.academicCalendar.findFirst({
        where: { organizationId, academicYear, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AcademicCalendar[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicCalendar.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AcademicCalendar[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.academicCalendar.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(calendar: AcademicCalendar): Promise<void> {
    return withTenant(this.db, calendar.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(calendar);
      await tx.academicCalendar.upsert({
        where: { id: calendar.id },
        create: { id: calendar.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.academicCalendar.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
