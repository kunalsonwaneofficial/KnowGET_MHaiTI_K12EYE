import type {
  Question,
  QuestionBank,
  QuestionBankRepository,
  QuestionBankRevision,
  QuestionBankStatus,
} from "@knowget/assessment-evaluation";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface QuestionBankRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  title: string;
  subjectId: string | null;
  questions: unknown;
  version: number;
  status: string;
  revisions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: QuestionBankRow): QuestionBank {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    title: row.title,
    subjectId: row.subjectId as Uuid | null,
    questions: (row.questions as Question[]) ?? [],
    version: row.version,
    status: row.status as QuestionBankStatus,
    revisions: (row.revisions as QuestionBankRevision[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(bank: QuestionBank) {
  return {
    tenantId: bank.tenantId,
    organizationId: bank.organizationId,
    code: bank.code,
    title: bank.title,
    subjectId: bank.subjectId,
    questions: JSON.parse(JSON.stringify(bank.questions)),
    version: bank.version,
    status: bank.status,
    revisions: JSON.parse(JSON.stringify(bank.revisions)),
  };
}

/** Prisma-backed {@link QuestionBankRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaQuestionBankRepository implements QuestionBankRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<QuestionBank | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.questionBank.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<QuestionBank | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.questionBank.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<QuestionBank[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.questionBank.findMany({ where: { subjectId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<QuestionBank[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.questionBank.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<QuestionBank[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.questionBank.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(bank: QuestionBank): Promise<void> {
    return withTenant(this.db, bank.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(bank);
      await tx.questionBank.upsert({
        where: { id: bank.id },
        create: { id: bank.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.questionBank.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
