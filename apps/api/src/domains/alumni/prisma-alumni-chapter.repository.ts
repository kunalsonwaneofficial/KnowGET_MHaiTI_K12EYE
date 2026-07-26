import type {
  AlumniChapter,
  AlumniChapterRepository,
  ChapterStatus,
  ChapterType,
} from "@knowget/alumni";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AlumniChapterRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  region: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AlumniChapterRow): AlumniChapter {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    type: row.type as ChapterType,
    region: row.region,
    status: row.status as ChapterStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(chapter: AlumniChapter) {
  return {
    tenantId: chapter.tenantId,
    organizationId: chapter.organizationId,
    code: chapter.code,
    name: chapter.name,
    type: chapter.type,
    region: chapter.region,
    status: chapter.status,
  };
}

/** Prisma-backed {@link AlumniChapterRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAlumniChapterRepository implements AlumniChapterRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AlumniChapter | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.alumniChapter.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<AlumniChapter | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.alumniChapter.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniChapter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.alumniChapter.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AlumniChapter[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.alumniChapter.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(chapter: AlumniChapter): Promise<void> {
    return withTenant(this.db, chapter.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(chapter);
      await tx.alumniChapter.upsert({
        where: { id: chapter.id },
        create: { id: chapter.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.alumniChapter.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
