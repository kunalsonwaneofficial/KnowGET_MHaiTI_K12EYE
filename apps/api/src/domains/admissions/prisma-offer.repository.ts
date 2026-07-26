import type { Offer, OfferRepository, OfferStatus } from "@knowget/admissions";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface OfferRow {
  id: string;
  tenantId: string;
  organizationId: string;
  applicationId: string;
  cycleId: string;
  gradeOffered: string;
  extendedOn: string;
  respondBy: string | null;
  status: string;
  respondedOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: OfferRow): Offer {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    applicationId: row.applicationId as Uuid,
    cycleId: row.cycleId as Uuid,
    gradeOffered: row.gradeOffered,
    extendedOn: row.extendedOn,
    respondBy: row.respondBy,
    status: row.status as OfferStatus,
    respondedOn: row.respondedOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(offer: Offer) {
  return {
    tenantId: offer.tenantId,
    organizationId: offer.organizationId,
    applicationId: offer.applicationId,
    cycleId: offer.cycleId,
    gradeOffered: offer.gradeOffered,
    extendedOn: offer.extendedOn,
    respondBy: offer.respondBy,
    status: offer.status,
    respondedOn: offer.respondedOn,
  };
}

/** Prisma-backed {@link OfferRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaOfferRepository implements OfferRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Offer | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.offer.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByApplication(tenantId: TenantId, applicationId: Uuid): Promise<Offer | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.offer.findFirst({ where: { applicationId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<Offer[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.offer.findMany({ where: { cycleId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.offer.count({ where: { cycleId, deletedAt: null } });
    });
  }

  listByTenant(tenantId: TenantId): Promise<Offer[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.offer.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(offer: Offer): Promise<void> {
    return withTenant(this.db, offer.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(offer);
      await tx.offer.upsert({
        where: { id: offer.id },
        create: { id: offer.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.offer.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
