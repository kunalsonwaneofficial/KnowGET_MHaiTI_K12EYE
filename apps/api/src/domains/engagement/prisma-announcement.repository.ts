import type {
  Announcement,
  AnnouncementCategory,
  AnnouncementPriority,
  AnnouncementRepository,
  AnnouncementStatus,
} from "@knowget/engagement";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AnnouncementRow {
  id: string;
  tenantId: string;
  organizationId: string;
  audienceId: string;
  authorPersonId: string;
  title: string;
  body: string;
  category: string;
  priority: string;
  status: string;
  pinned: boolean;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AnnouncementRow): Announcement {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    audienceId: row.audienceId as Uuid,
    authorPersonId: row.authorPersonId as Uuid,
    title: row.title,
    body: row.body,
    category: row.category as AnnouncementCategory,
    priority: row.priority as AnnouncementPriority,
    status: row.status as AnnouncementStatus,
    pinned: row.pinned,
    scheduledFor: row.scheduledFor,
    publishedAt: row.publishedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(announcement: Announcement) {
  return {
    tenantId: announcement.tenantId,
    organizationId: announcement.organizationId,
    audienceId: announcement.audienceId,
    authorPersonId: announcement.authorPersonId,
    title: announcement.title,
    body: announcement.body,
    category: announcement.category,
    priority: announcement.priority,
    status: announcement.status,
    pinned: announcement.pinned,
    scheduledFor: announcement.scheduledFor,
    publishedAt: announcement.publishedAt,
  };
}

/** Prisma-backed {@link AnnouncementRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAnnouncementRepository implements AnnouncementRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Announcement | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.announcement.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByAudience(tenantId: TenantId, audienceId: Uuid): Promise<Announcement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.announcement.findMany({ where: { audienceId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listPublishedByAudience(tenantId: TenantId, audienceId: Uuid): Promise<Announcement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.announcement.findMany({
        where: { audienceId, status: "published", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Announcement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.announcement.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Announcement[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.announcement.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(announcement: Announcement): Promise<void> {
    return withTenant(this.db, announcement.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(announcement);
      await tx.announcement.upsert({
        where: { id: announcement.id },
        create: { id: announcement.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
