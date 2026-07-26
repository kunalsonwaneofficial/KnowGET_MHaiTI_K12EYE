import type {
  ChapterMembership,
  ChapterMembershipRepository,
  MembershipRole,
  MembershipStatus,
} from "@knowget/alumni";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ChapterMembershipRow {
  id: string;
  tenantId: string;
  organizationId: string;
  chapterId: string;
  alumniProfileId: string;
  role: string;
  status: string;
  joinedOn: string;
  leftOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ChapterMembershipRow): ChapterMembership {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    chapterId: row.chapterId as Uuid,
    alumniProfileId: row.alumniProfileId as Uuid,
    role: row.role as MembershipRole,
    status: row.status as MembershipStatus,
    joinedOn: row.joinedOn,
    leftOn: row.leftOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(membership: ChapterMembership) {
  return {
    tenantId: membership.tenantId,
    organizationId: membership.organizationId,
    chapterId: membership.chapterId,
    alumniProfileId: membership.alumniProfileId,
    role: membership.role,
    status: membership.status,
    joinedOn: membership.joinedOn,
    leftOn: membership.leftOn,
  };
}

/** Prisma-backed {@link ChapterMembershipRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaChapterMembershipRepository implements ChapterMembershipRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ChapterMembership | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.chapterMembership.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByChapterAndAlumnus(
    tenantId: TenantId,
    chapterId: Uuid,
    alumniProfileId: Uuid,
  ): Promise<ChapterMembership | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.chapterMembership.findFirst({
        where: { chapterId, alumniProfileId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByChapter(tenantId: TenantId, chapterId: Uuid): Promise<ChapterMembership[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.chapterMembership.findMany({ where: { chapterId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<ChapterMembership[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.chapterMembership.findMany({
        where: { alumniProfileId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  countActiveByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.chapterMembership.count({
        where: { alumniProfileId, status: "active", deletedAt: null },
      });
    });
  }

  listByTenant(tenantId: TenantId): Promise<ChapterMembership[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.chapterMembership.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(membership: ChapterMembership): Promise<void> {
    return withTenant(this.db, membership.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(membership);
      await tx.chapterMembership.upsert({
        where: { id: membership.id },
        create: { id: membership.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.chapterMembership.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
