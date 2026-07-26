import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { CentreProfile, CentreProfileRepository } from "@knowget/health-centre";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface CentreProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  centreId: string;
  centreCode: string;
  sickBayCapacity: number;
  activeAdmissionCount: number;
  bedsAvailable: number;
  occupancyPercent: number;
  overCapacity: boolean;
  openAppointmentCount: number;
  openEncounterCount: number;
  activePrescriptionCount: number;
  overduePrescriptionCount: number;
  openReferralCount: number;
  version: number;
  refreshedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CentreProfileRow): CentreProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    centreId: row.centreId as Uuid,
    centreCode: row.centreCode,
    sickBayCapacity: row.sickBayCapacity,
    activeAdmissionCount: row.activeAdmissionCount,
    bedsAvailable: row.bedsAvailable,
    occupancyPercent: row.occupancyPercent,
    overCapacity: row.overCapacity,
    openAppointmentCount: row.openAppointmentCount,
    openEncounterCount: row.openEncounterCount,
    activePrescriptionCount: row.activePrescriptionCount,
    overduePrescriptionCount: row.overduePrescriptionCount,
    openReferralCount: row.openReferralCount,
    version: row.version,
    refreshedAt: (row.refreshedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: CentreProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    centreId: profile.centreId,
    centreCode: profile.centreCode,
    sickBayCapacity: profile.sickBayCapacity,
    activeAdmissionCount: profile.activeAdmissionCount,
    bedsAvailable: profile.bedsAvailable,
    occupancyPercent: profile.occupancyPercent,
    overCapacity: profile.overCapacity,
    openAppointmentCount: profile.openAppointmentCount,
    openEncounterCount: profile.openEncounterCount,
    activePrescriptionCount: profile.activePrescriptionCount,
    overduePrescriptionCount: profile.overduePrescriptionCount,
    openReferralCount: profile.openReferralCount,
    version: profile.version,
    refreshedAt: profile.refreshedAt,
  };
}

/** Prisma-backed {@link CentreProfileRepository} (RLS via {@link withTenant}; one per centre; soft delete). */
export class PrismaCentreProfileRepository implements CentreProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CentreProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.centreProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCentre(tenantId: TenantId, centreId: Uuid): Promise<CentreProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.centreProfile.findFirst({ where: { centreId, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<CentreProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.centreProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: CentreProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.centreProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.centreProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
