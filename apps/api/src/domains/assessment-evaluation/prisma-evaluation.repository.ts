import type {
  Evaluation,
  EvaluationEntry,
  EvaluationRepository,
  EvaluationStatus,
  EvaluationType,
  RubricScore,
} from "@knowget/assessment-evaluation";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EvaluationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  assessmentId: string;
  studentId: string;
  evaluationType: string;
  maximumMarks: number;
  marksAwarded: number | null;
  percentage: number | null;
  rubricScores: unknown;
  remarks: string | null;
  status: string;
  version: number;
  history: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EvaluationRow): Evaluation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    assessmentId: row.assessmentId as Uuid,
    studentId: row.studentId as Uuid,
    evaluationType: row.evaluationType as EvaluationType,
    maximumMarks: row.maximumMarks,
    marksAwarded: row.marksAwarded,
    percentage: row.percentage,
    rubricScores: (row.rubricScores as RubricScore[]) ?? [],
    remarks: row.remarks,
    status: row.status as EvaluationStatus,
    version: row.version,
    history: (row.history as EvaluationEntry[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(evaluation: Evaluation) {
  return {
    tenantId: evaluation.tenantId,
    organizationId: evaluation.organizationId,
    assessmentId: evaluation.assessmentId,
    studentId: evaluation.studentId,
    evaluationType: evaluation.evaluationType,
    maximumMarks: evaluation.maximumMarks,
    marksAwarded: evaluation.marksAwarded,
    percentage: evaluation.percentage,
    rubricScores: JSON.parse(JSON.stringify(evaluation.rubricScores)),
    remarks: evaluation.remarks,
    status: evaluation.status,
    version: evaluation.version,
    history: JSON.parse(JSON.stringify(evaluation.history)),
  };
}

/** Prisma-backed {@link EvaluationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEvaluationRepository implements EvaluationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Evaluation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.evaluation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByAssessmentAndStudent(
    tenantId: TenantId,
    assessmentId: Uuid,
    studentId: Uuid,
  ): Promise<Evaluation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.evaluation.findFirst({
        where: { assessmentId, studentId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<Evaluation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.evaluation.findMany({ where: { assessmentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Evaluation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.evaluation.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Evaluation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.evaluation.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Evaluation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.evaluation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(evaluation: Evaluation): Promise<void> {
    return withTenant(this.db, evaluation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(evaluation);
      await tx.evaluation.upsert({
        where: { id: evaluation.id },
        create: { id: evaluation.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.evaluation.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
