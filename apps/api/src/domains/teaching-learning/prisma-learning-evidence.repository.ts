import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  InstructionalActivityKind,
  LearningEvidence,
  LearningEvidenceRepository,
  LearningEvidenceType,
} from "@knowget/teaching-learning";
import type { TenantId, Uuid } from "@knowget/types";

interface LearningEvidenceRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  evidenceType: string;
  activityKind: string;
  activityId: string;
  subjectId: string | null;
  learningOutcomeIds: unknown;
  title: string;
  description: string | null;
  capturedAt: string;
  capturedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LearningEvidenceRow): LearningEvidence {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    evidenceType: row.evidenceType as LearningEvidenceType,
    activityKind: row.activityKind as InstructionalActivityKind,
    activityId: row.activityId as Uuid,
    subjectId: row.subjectId as Uuid | null,
    learningOutcomeIds: (row.learningOutcomeIds as Uuid[]) ?? [],
    title: row.title,
    description: row.description,
    capturedAt: row.capturedAt,
    capturedBy: row.capturedBy as Uuid | null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(evidence: LearningEvidence) {
  return {
    tenantId: evidence.tenantId,
    organizationId: evidence.organizationId,
    studentId: evidence.studentId,
    evidenceType: evidence.evidenceType,
    activityKind: evidence.activityKind,
    activityId: evidence.activityId,
    subjectId: evidence.subjectId,
    learningOutcomeIds: JSON.parse(JSON.stringify(evidence.learningOutcomeIds)),
    title: evidence.title,
    description: evidence.description,
    capturedAt: evidence.capturedAt,
    capturedBy: evidence.capturedBy,
  };
}

/** Prisma-backed {@link LearningEvidenceRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLearningEvidenceRepository implements LearningEvidenceRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LearningEvidence | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.learningEvidence.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<LearningEvidence[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningEvidence.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByActivity(
    tenantId: TenantId,
    activityKind: InstructionalActivityKind,
    activityId: Uuid,
  ): Promise<LearningEvidence[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningEvidence.findMany({
        where: { activityKind, activityId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LearningEvidence[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningEvidence.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LearningEvidence[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.learningEvidence.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(evidence: LearningEvidence): Promise<void> {
    return withTenant(this.db, evidence.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(evidence);
      await tx.learningEvidence.upsert({
        where: { id: evidence.id },
        create: { id: evidence.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.learningEvidence.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
