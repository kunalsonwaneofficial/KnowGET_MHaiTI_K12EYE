import type {
  AdmissionsFunnelProfile,
  AdmissionsFunnelProfileRepository,
} from "@knowget/admissions";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface AdmissionsFunnelProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  cycleId: string;
  leadCount: number;
  applicationCount: number;
  offerCount: number;
  enrollmentCount: number;
  leadToApplicationPercent: number;
  applicationToOfferPercent: number;
  offerToEnrollmentPercent: number;
  overallConversionPercent: number;
  gradeCount: number;
  totalCapacity: number;
  totalConfirmed: number;
  fillPercent: number;
  refreshedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AdmissionsFunnelProfileRow): AdmissionsFunnelProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    cycleId: row.cycleId as Uuid,
    leadCount: row.leadCount,
    applicationCount: row.applicationCount,
    offerCount: row.offerCount,
    enrollmentCount: row.enrollmentCount,
    leadToApplicationPercent: row.leadToApplicationPercent,
    applicationToOfferPercent: row.applicationToOfferPercent,
    offerToEnrollmentPercent: row.offerToEnrollmentPercent,
    overallConversionPercent: row.overallConversionPercent,
    gradeCount: row.gradeCount,
    totalCapacity: row.totalCapacity,
    totalConfirmed: row.totalConfirmed,
    fillPercent: row.fillPercent,
    refreshedAt: row.refreshedAt as ISODateString,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: AdmissionsFunnelProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    cycleId: profile.cycleId,
    leadCount: profile.leadCount,
    applicationCount: profile.applicationCount,
    offerCount: profile.offerCount,
    enrollmentCount: profile.enrollmentCount,
    leadToApplicationPercent: profile.leadToApplicationPercent,
    applicationToOfferPercent: profile.applicationToOfferPercent,
    offerToEnrollmentPercent: profile.offerToEnrollmentPercent,
    overallConversionPercent: profile.overallConversionPercent,
    gradeCount: profile.gradeCount,
    totalCapacity: profile.totalCapacity,
    totalConfirmed: profile.totalConfirmed,
    fillPercent: profile.fillPercent,
    refreshedAt: profile.refreshedAt,
  };
}

/**
 * Prisma-backed {@link AdmissionsFunnelProfileRepository} (RLS via {@link withTenant}; soft delete). The
 * profile is a re-derivable projection — one per cycle, upserted by the refresh spine.
 */
export class PrismaAdmissionsFunnelProfileRepository implements AdmissionsFunnelProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findByCycle(tenantId: TenantId, cycleId: Uuid): Promise<AdmissionsFunnelProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.admissionsFunnelProfile.findFirst({
        where: { cycleId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<AdmissionsFunnelProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.admissionsFunnelProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: AdmissionsFunnelProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.admissionsFunnelProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }
}
