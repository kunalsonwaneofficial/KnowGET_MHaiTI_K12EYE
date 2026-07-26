import type {
  AdmissionEvaluation,
  AdmissionEvaluationRepository,
  EvaluationRecommendation,
  EvaluationType,
} from "@knowget/admissions";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AdmissionEvaluationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  applicationId: string;
  type: string;
  score: number;
  recommendation: string;
  evaluatedOn: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AdmissionEvaluationRow): AdmissionEvaluation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    applicationId: row.applicationId as Uuid,
    type: row.type as EvaluationType,
    score: row.score,
    recommendation: row.recommendation as EvaluationRecommendation,
    evaluatedOn: row.evaluatedOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(evaluation: AdmissionEvaluation) {
  return {
    tenantId: evaluation.tenantId,
    organizationId: evaluation.organizationId,
    applicationId: evaluation.applicationId,
    type: evaluation.type,
    score: evaluation.score,
    recommendation: evaluation.recommendation,
    evaluatedOn: evaluation.evaluatedOn,
  };
}

/**
 * Prisma-backed {@link AdmissionEvaluationRepository} (RLS via {@link withTenant}). The evaluation log is
 * immutable and append-only, so there is no `remove`.
 */
export class PrismaAdmissionEvaluationRepository implements AdmissionEvaluationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AdmissionEvaluation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.admissionEvaluation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByApplication(tenantId: TenantId, applicationId: Uuid): Promise<AdmissionEvaluation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.admissionEvaluation.findMany({
        where: { applicationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  countByApplication(tenantId: TenantId, applicationId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.admissionEvaluation.count({ where: { applicationId, deletedAt: null } });
    });
  }

  listByTenant(tenantId: TenantId): Promise<AdmissionEvaluation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.admissionEvaluation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(evaluation: AdmissionEvaluation): Promise<void> {
    return withTenant(this.db, evaluation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(evaluation);
      await tx.admissionEvaluation.upsert({
        where: { id: evaluation.id },
        create: { id: evaluation.id, ...fields },
        update: fields,
      });
    });
  }
}
