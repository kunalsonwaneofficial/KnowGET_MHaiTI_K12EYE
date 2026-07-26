import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Title, TitleRepository, TitleStatus, TitleType } from "@knowget/library";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface TitleRow {
  id: string;
  tenantId: string;
  organizationId: string;
  isbn: string | null;
  title: string;
  authors: unknown;
  subjects: unknown;
  type: string;
  language: string | null;
  publisher: string | null;
  publicationYear: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: TitleRow): Title {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    isbn: row.isbn,
    title: row.title,
    authors: (row.authors as string[]) ?? [],
    subjects: (row.subjects as string[]) ?? [],
    type: row.type as TitleType,
    language: row.language,
    publisher: row.publisher,
    publicationYear: row.publicationYear,
    status: row.status as TitleStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(title: Title) {
  return {
    tenantId: title.tenantId,
    organizationId: title.organizationId,
    isbn: title.isbn,
    title: title.title,
    authors: JSON.parse(JSON.stringify(title.authors)),
    subjects: JSON.parse(JSON.stringify(title.subjects)),
    type: title.type,
    language: title.language,
    publisher: title.publisher,
    publicationYear: title.publicationYear,
    status: title.status,
  };
}

/** Prisma-backed {@link TitleRepository} (RLS via {@link withTenant}; authors/subjects JSONB; soft delete). */
export class PrismaTitleRepository implements TitleRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Title | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.title.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByIsbn(tenantId: TenantId, isbn: string): Promise<Title | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.title.findFirst({ where: { isbn, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Title[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.title.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Title[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.title.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(title: Title): Promise<void> {
    return withTenant(this.db, title.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(title);
      await tx.title.upsert({
        where: { id: title.id },
        create: { id: title.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.title.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
