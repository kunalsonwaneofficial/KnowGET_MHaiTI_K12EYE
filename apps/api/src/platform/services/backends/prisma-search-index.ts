import { PrismaService } from "@knowget/database";
import type {
  FieldValue,
  SearchDocument,
  SearchHit,
  SearchQuery,
  SearchResult,
} from "@knowget/search";
import { Prisma } from "@prisma/client";
import type { SearchService } from "./search-service";

interface SearchRow {
  id: string;
  fields: Record<string, FieldValue>;
  score: number;
  total: bigint;
}

/**
 * PostgreSQL full-text {@link SearchService} (TD-19): documents in a shared table
 * with a generated `tsvector` (GIN-indexed). Queries rank with `plainto_tsquery` +
 * `ts_rank`; exact-match `fields` filters use JSONB containment (`@>`). Global (the
 * port is tenant-agnostic; a tenant is just a filterable field). Selected by
 * `SERVICES_STORE=persisted`.
 */
export class PrismaSearchIndex implements SearchService {
  constructor(private readonly db: PrismaService) {}

  async index(document: SearchDocument): Promise<void> {
    const fields = (document.fields ?? {}) as Prisma.InputJsonValue;
    await this.db.client.serviceSearchDocument.upsert({
      where: { id: document.id },
      create: { id: document.id, text: document.text, fields },
      update: { text: document.text, fields },
    });
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.client.serviceSearchDocument.deleteMany({ where: { id } });
    return result.count > 0;
  }

  async search(query: SearchQuery): Promise<SearchResult> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = query.pageSize ?? 10;
    const offset = (page - 1) * pageSize;
    const text = query.text.trim();
    const filterJson = JSON.stringify(query.filters ?? {});

    const textMatch = text
      ? Prisma.sql`tsv @@ plainto_tsquery('english', ${text})`
      : Prisma.sql`TRUE`;
    const score = text
      ? Prisma.sql`ts_rank(tsv, plainto_tsquery('english', ${text}))`
      : Prisma.sql`0`;

    const rows = await this.db.client.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT id, fields, ${score}::float8 AS score, count(*) OVER() AS total
      FROM service_search_document
      WHERE ${textMatch} AND fields @> ${filterJson}::jsonb
      ORDER BY score DESC, id ASC
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
    const hits: SearchHit[] = rows.map((row) => ({
      id: row.id,
      score: Number(row.score),
      fields: row.fields,
    }));
    return { hits, total, page, pageSize };
  }

  async size(): Promise<number> {
    return this.db.client.serviceSearchDocument.count();
  }
}
