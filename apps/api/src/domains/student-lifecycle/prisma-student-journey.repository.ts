import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  EducationalJourney,
  EducationalJourneyRepository,
  JourneyEntry,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

interface JourneyRow {
  id: string;
  tenantId: string;
  studentId: string;
  organizationId: string;
  entries: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: JourneyRow): EducationalJourney {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    studentId: row.studentId as Uuid,
    organizationId: row.organizationId as Uuid,
    entries: (row.entries as JourneyEntry[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(journey: EducationalJourney) {
  return {
    tenantId: journey.tenantId,
    studentId: journey.studentId,
    organizationId: journey.organizationId,
    entries: JSON.parse(JSON.stringify(journey.entries)),
  };
}

/** Prisma-backed {@link EducationalJourneyRepository} (RLS via {@link withTenant}). */
export class PrismaStudentJourneyRepository implements EducationalJourneyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EducationalJourney | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentEducationalJourney.findFirst({
        where: { id, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findByStudent(tenantId: TenantId, studentId: Uuid): Promise<EducationalJourney | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentEducationalJourney.findFirst({
        where: { studentId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<EducationalJourney[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentEducationalJourney.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(journey: EducationalJourney): Promise<void> {
    return withTenant(this.db, journey.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(journey);
      await tx.studentEducationalJourney.upsert({
        where: { id: journey.id },
        create: { id: journey.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.studentEducationalJourney.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }
}
