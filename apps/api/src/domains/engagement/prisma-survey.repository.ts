import type {
  Survey,
  SurveyQuestion,
  SurveyRepository,
  SurveyStatus,
  SurveyType,
} from "@knowget/engagement";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SurveyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  audienceId: string;
  title: string;
  type: string;
  questions: unknown;
  status: string;
  opensAt: string | null;
  closesAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SurveyRow): Survey {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    audienceId: row.audienceId as Uuid,
    title: row.title,
    type: row.type as SurveyType,
    questions: (row.questions as SurveyQuestion[] | null) ?? [],
    status: row.status as SurveyStatus,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(survey: Survey) {
  return {
    tenantId: survey.tenantId,
    organizationId: survey.organizationId,
    audienceId: survey.audienceId,
    title: survey.title,
    type: survey.type,
    // Serialize to a plain JSON value for the JSONB column.
    questions: JSON.parse(JSON.stringify(survey.questions)),
    status: survey.status,
    opensAt: survey.opensAt,
    closesAt: survey.closesAt,
  };
}

/** Prisma-backed {@link SurveyRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSurveyRepository implements SurveyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Survey | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.survey.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByAudience(tenantId: TenantId, audienceId: Uuid): Promise<Survey[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.survey.findMany({ where: { audienceId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Survey[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.survey.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Survey[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.survey.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(survey: Survey): Promise<void> {
    return withTenant(this.db, survey.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(survey);
      await tx.survey.upsert({
        where: { id: survey.id },
        create: { id: survey.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.survey.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
