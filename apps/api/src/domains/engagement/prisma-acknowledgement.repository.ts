import type { AcknowledgementReceipt, AcknowledgementRepository } from "@knowget/engagement";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AcknowledgementRow {
  id: string;
  tenantId: string;
  organizationId: string;
  announcementId: string;
  personId: string;
  acknowledgedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AcknowledgementRow): AcknowledgementReceipt {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    announcementId: row.announcementId as Uuid,
    personId: row.personId as Uuid,
    acknowledgedAt: row.acknowledgedAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(receipt: AcknowledgementReceipt) {
  return {
    tenantId: receipt.tenantId,
    organizationId: receipt.organizationId,
    announcementId: receipt.announcementId,
    personId: receipt.personId,
    acknowledgedAt: receipt.acknowledgedAt,
  };
}

/**
 * Prisma-backed {@link AcknowledgementRepository} (RLS via {@link withTenant}). The receipt log is immutable
 * and append-only, so there is no `remove`. The one-per-(announcement, person) rule is DB-backed by a unique
 * index; `findByAnnouncementAndPerson` is the service's fast pre-check.
 */
export class PrismaAcknowledgementRepository implements AcknowledgementRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AcknowledgementReceipt | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.acknowledgementReceipt.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByAnnouncementAndPerson(
    tenantId: TenantId,
    announcementId: Uuid,
    personId: Uuid,
  ): Promise<AcknowledgementReceipt | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.acknowledgementReceipt.findFirst({
        where: { announcementId, personId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByAnnouncement(tenantId: TenantId, announcementId: Uuid): Promise<AcknowledgementReceipt[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.acknowledgementReceipt.findMany({
        where: { announcementId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  countByAnnouncement(tenantId: TenantId, announcementId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.acknowledgementReceipt.count({ where: { announcementId, deletedAt: null } });
    });
  }

  listByTenant(tenantId: TenantId): Promise<AcknowledgementReceipt[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.acknowledgementReceipt.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(receipt: AcknowledgementReceipt): Promise<void> {
    return withTenant(this.db, receipt.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(receipt);
      await tx.acknowledgementReceipt.upsert({
        where: { id: receipt.id },
        create: { id: receipt.id, ...fields },
        update: fields,
      });
    });
  }
}
