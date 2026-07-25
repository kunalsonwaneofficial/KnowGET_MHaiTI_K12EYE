import type {
  Timetable,
  TimetableRepository,
  TimetableRevision,
  TimetableStatus,
} from "@knowget/academic-scheduling";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface TimetableRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  academicYear: string;
  term: string | null;
  gradeId: string;
  classId: string | null;
  sectionId: string | null;
  version: number;
  status: string;
  revisions: unknown;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: TimetableRow): Timetable {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    academicYear: row.academicYear,
    term: row.term,
    gradeId: row.gradeId as Uuid,
    classId: (row.classId as Uuid | null) ?? null,
    sectionId: (row.sectionId as Uuid | null) ?? null,
    version: row.version,
    status: row.status as TimetableStatus,
    revisions: (row.revisions as TimetableRevision[]) ?? [],
    publishedAt: row.publishedAt ? toIso(row.publishedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(timetable: Timetable) {
  return {
    tenantId: timetable.tenantId,
    organizationId: timetable.organizationId,
    code: timetable.code,
    name: timetable.name,
    academicYear: timetable.academicYear,
    term: timetable.term,
    gradeId: timetable.gradeId,
    classId: timetable.classId,
    sectionId: timetable.sectionId,
    version: timetable.version,
    status: timetable.status,
    revisions: JSON.parse(JSON.stringify(timetable.revisions)),
    publishedAt: timetable.publishedAt ? new Date(timetable.publishedAt) : null,
  };
}

/** Prisma-backed {@link TimetableRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaTimetableRepository implements TimetableRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Timetable | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.timetable.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<Timetable | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.timetable.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Timetable[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.timetable.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Timetable[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.timetable.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByPeriod(
    tenantId: TenantId,
    organizationId: Uuid,
    academicYear: string,
    term: string | null,
  ): Promise<Timetable[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.timetable.findMany({
        where: { organizationId, academicYear, term, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  save(timetable: Timetable): Promise<void> {
    return withTenant(this.db, timetable.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(timetable);
      await tx.timetable.upsert({
        where: { id: timetable.id },
        create: { id: timetable.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.timetable.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
