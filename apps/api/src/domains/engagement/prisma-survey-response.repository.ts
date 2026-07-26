import type {
  SurveyAnswerView,
  SurveyResponse,
  SurveyResponseRepository,
} from "@knowget/engagement";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SurveyResponseRow {
  id: string;
  tenantId: string;
  organizationId: string;
  surveyId: string;
  respondentPersonId: string | null;
  answers: unknown;
  submittedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SurveyResponseRow): SurveyResponse {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    surveyId: row.surveyId as Uuid,
    respondentPersonId: (row.respondentPersonId as Uuid | null) ?? null,
    answers: (row.answers as SurveyAnswerView[] | null) ?? [],
    submittedAt: row.submittedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(response: SurveyResponse) {
  return {
    tenantId: response.tenantId,
    organizationId: response.organizationId,
    surveyId: response.surveyId,
    respondentPersonId: response.respondentPersonId,
    // Serialize to a plain JSON value for the JSONB column.
    answers: JSON.parse(JSON.stringify(response.answers)),
    submittedAt: response.submittedAt,
  };
}

/**
 * Prisma-backed {@link SurveyResponseRepository} (RLS via {@link withTenant}). Responses are immutable and
 * append-only, so there is no `remove`. The one-identified-response-per-(survey, respondent) rule is DB-backed
 * by a unique index (NULL respondents are distinct, so anonymous responses are unbounded);
 * `findBySurveyAndRespondent` is the service's fast pre-check.
 */
export class PrismaSurveyResponseRepository implements SurveyResponseRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SurveyResponse | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.surveyResponse.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findBySurveyAndRespondent(
    tenantId: TenantId,
    surveyId: Uuid,
    respondentPersonId: Uuid,
  ): Promise<SurveyResponse | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.surveyResponse.findFirst({
        where: { surveyId, respondentPersonId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listBySurvey(tenantId: TenantId, surveyId: Uuid): Promise<SurveyResponse[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.surveyResponse.findMany({ where: { surveyId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  countBySurvey(tenantId: TenantId, surveyId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.surveyResponse.count({ where: { surveyId, deletedAt: null } });
    });
  }

  listByTenant(tenantId: TenantId): Promise<SurveyResponse[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.surveyResponse.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(response: SurveyResponse): Promise<void> {
    return withTenant(this.db, response.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(response);
      await tx.surveyResponse.upsert({
        where: { id: response.id },
        create: { id: response.id, ...fields },
        update: fields,
      });
    });
  }
}
