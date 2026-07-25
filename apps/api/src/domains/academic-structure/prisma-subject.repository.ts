import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Subject,
  SubjectKind,
  SubjectRepository,
  SubjectStatus,
} from "@knowget/academic-structure";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SubjectRow {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  code: string;
  kind: string;
  credits: number | null;
  electiveGroup: string | null;
  crossDisciplinary: boolean;
  prerequisites: string[];
  version: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SubjectRow): Subject {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    name: row.name,
    code: row.code,
    kind: row.kind as SubjectKind,
    credits: row.credits,
    electiveGroup: row.electiveGroup,
    crossDisciplinary: row.crossDisciplinary,
    prerequisites: [...((row.prerequisites as Uuid[]) ?? [])],
    version: row.version,
    status: row.status as SubjectStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(subject: Subject) {
  return {
    tenantId: subject.tenantId,
    organizationId: subject.organizationId,
    name: subject.name,
    code: subject.code,
    kind: subject.kind,
    credits: subject.credits,
    electiveGroup: subject.electiveGroup,
    crossDisciplinary: subject.crossDisciplinary,
    prerequisites: [...subject.prerequisites],
    version: subject.version,
    status: subject.status,
  };
}

/** Prisma-backed {@link SubjectRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSubjectRepository implements SubjectRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Subject | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.subject.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, organizationId: Uuid, code: string): Promise<Subject | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.subject.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Subject[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.subject.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Subject[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.subject.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(subject: Subject): Promise<void> {
    return withTenant(this.db, subject.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(subject);
      await tx.subject.upsert({
        where: { id: subject.id },
        create: { id: subject.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.subject.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
