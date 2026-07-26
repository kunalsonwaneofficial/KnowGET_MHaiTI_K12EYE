import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  OPEN_REFERRAL_STATUSES,
  type Referral,
  type ReferralRepository,
  type ReferralStatus,
  type ReferralUrgency,
} from "@knowget/health-centre";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

const OPEN = [...OPEN_REFERRAL_STATUSES];

interface ReferralRow {
  id: string;
  tenantId: string;
  organizationId: string;
  centreId: string;
  patientId: string;
  clinicianId: string | null;
  referredTo: string;
  urgency: string;
  reason: string | null;
  raisedOn: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ReferralRow): Referral {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    centreId: row.centreId as Uuid,
    patientId: row.patientId as Uuid,
    clinicianId: (row.clinicianId as Uuid | null) ?? null,
    referredTo: row.referredTo,
    urgency: row.urgency as ReferralUrgency,
    reason: row.reason,
    raisedOn: row.raisedOn,
    status: row.status as ReferralStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(referral: Referral) {
  return {
    tenantId: referral.tenantId,
    organizationId: referral.organizationId,
    centreId: referral.centreId,
    patientId: referral.patientId,
    clinicianId: referral.clinicianId,
    referredTo: referral.referredTo,
    urgency: referral.urgency,
    reason: referral.reason,
    raisedOn: referral.raisedOn,
    status: referral.status,
  };
}

/** Prisma-backed {@link ReferralRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaReferralRepository implements ReferralRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Referral | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.referral.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByPatient(tenantId: TenantId, patientId: Uuid): Promise<Referral[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.referral.findMany({ where: { patientId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByCentre(tenantId: TenantId, centreId: Uuid): Promise<Referral[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.referral.findMany({ where: { centreId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listOpenByCentre(tenantId: TenantId, centreId: Uuid): Promise<Referral[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.referral.findMany({
        where: { centreId, status: { in: OPEN }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Referral[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.referral.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Referral[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.referral.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(referral: Referral): Promise<void> {
    return withTenant(this.db, referral.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(referral);
      await tx.referral.upsert({
        where: { id: referral.id },
        create: { id: referral.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.referral.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
