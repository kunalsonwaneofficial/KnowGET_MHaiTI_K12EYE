import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  ClassroomSession,
  ClassroomSessionRepository,
  ClassroomSessionStatus,
  ParticipationSummary,
} from "@knowget/teaching-learning";
import type { TenantId, Uuid } from "@knowget/types";

interface ClassroomSessionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  scheduleSlotId: string | null;
  lessonPlanId: string | null;
  sectionId: string | null;
  subjectId: string | null;
  title: string;
  date: string;
  plannedTopics: unknown;
  actualTopicsCovered: unknown;
  activitiesCompleted: unknown;
  resourcesUsedIds: unknown;
  participation: unknown;
  teacherReflections: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ClassroomSessionRow): ClassroomSession {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    scheduleSlotId: row.scheduleSlotId as Uuid | null,
    lessonPlanId: row.lessonPlanId as Uuid | null,
    sectionId: row.sectionId as Uuid | null,
    subjectId: row.subjectId as Uuid | null,
    title: row.title,
    date: row.date,
    plannedTopics: (row.plannedTopics as string[]) ?? [],
    actualTopicsCovered: (row.actualTopicsCovered as string[]) ?? [],
    activitiesCompleted: (row.activitiesCompleted as string[]) ?? [],
    resourcesUsedIds: (row.resourcesUsedIds as Uuid[]) ?? [],
    participation: (row.participation as ParticipationSummary | null) ?? null,
    teacherReflections: row.teacherReflections,
    status: row.status as ClassroomSessionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(session: ClassroomSession) {
  return {
    tenantId: session.tenantId,
    organizationId: session.organizationId,
    scheduleSlotId: session.scheduleSlotId,
    lessonPlanId: session.lessonPlanId,
    sectionId: session.sectionId,
    subjectId: session.subjectId,
    title: session.title,
    date: session.date,
    plannedTopics: JSON.parse(JSON.stringify(session.plannedTopics)),
    actualTopicsCovered: JSON.parse(JSON.stringify(session.actualTopicsCovered)),
    activitiesCompleted: JSON.parse(JSON.stringify(session.activitiesCompleted)),
    resourcesUsedIds: JSON.parse(JSON.stringify(session.resourcesUsedIds)),
    participation: session.participation ? JSON.parse(JSON.stringify(session.participation)) : null,
    teacherReflections: session.teacherReflections,
    status: session.status,
  };
}

/** Prisma-backed {@link ClassroomSessionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaClassroomSessionRepository implements ClassroomSessionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ClassroomSession | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.classroomSession.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySection(tenantId: TenantId, sectionId: Uuid): Promise<ClassroomSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.classroomSession.findMany({ where: { sectionId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<ClassroomSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.classroomSession.findMany({ where: { subjectId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ClassroomSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.classroomSession.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ClassroomSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.classroomSession.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(session: ClassroomSession): Promise<void> {
    return withTenant(this.db, session.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(session);
      await tx.classroomSession.upsert({
        where: { id: session.id },
        create: { id: session.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.classroomSession.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
