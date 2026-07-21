import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CommunicationChannel,
  CommunicationProfile,
  CommunicationProfileRepository,
  CommunicationSchedule,
  NotificationPreference,
} from "@knowget/family-guardian";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CommunicationProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  familyId: string;
  preferredLanguage: string | null;
  preferredChannels: string[];
  schedules: unknown;
  notificationPreferences: unknown;
  accessibilityRequirements: string[];
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CommunicationProfileRow): CommunicationProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    familyId: row.familyId as Uuid,
    preferredLanguage: row.preferredLanguage,
    preferredChannels: (row.preferredChannels as CommunicationChannel[]) ?? [],
    schedules: (row.schedules as CommunicationSchedule[]) ?? [],
    notificationPreferences: (row.notificationPreferences as NotificationPreference[]) ?? [],
    accessibilityRequirements: row.accessibilityRequirements ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: CommunicationProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    familyId: profile.familyId,
    preferredLanguage: profile.preferredLanguage,
    preferredChannels: [...profile.preferredChannels],
    schedules: JSON.parse(JSON.stringify(profile.schedules)),
    notificationPreferences: JSON.parse(JSON.stringify(profile.notificationPreferences)),
    accessibilityRequirements: [...profile.accessibilityRequirements],
  };
}

/** Prisma-backed {@link CommunicationProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCommunicationProfileRepository implements CommunicationProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CommunicationProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.communicationProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByFamily(tenantId: TenantId, familyId: Uuid): Promise<CommunicationProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.communicationProfile.findFirst({
        where: { familyId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CommunicationProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.communicationProfile.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CommunicationProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.communicationProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: CommunicationProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.communicationProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.communicationProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
