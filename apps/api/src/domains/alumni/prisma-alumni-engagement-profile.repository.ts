import type {
  AlumniEngagementProfile,
  AlumniEngagementProfileRepository,
  EngagementLevel,
} from "@knowget/alumni";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface AlumniEngagementProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  alumniProfileId: string;
  eventsAttended: number;
  activeChapters: number;
  activeMentorships: number;
  contributionsCount: number;
  score: number;
  level: string;
  refreshedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AlumniEngagementProfileRow): AlumniEngagementProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    alumniProfileId: row.alumniProfileId as Uuid,
    eventsAttended: row.eventsAttended,
    activeChapters: row.activeChapters,
    activeMentorships: row.activeMentorships,
    contributionsCount: row.contributionsCount,
    score: row.score,
    level: row.level as EngagementLevel,
    refreshedAt: row.refreshedAt as ISODateString,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: AlumniEngagementProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    alumniProfileId: profile.alumniProfileId,
    eventsAttended: profile.eventsAttended,
    activeChapters: profile.activeChapters,
    activeMentorships: profile.activeMentorships,
    contributionsCount: profile.contributionsCount,
    score: profile.score,
    level: profile.level,
    refreshedAt: profile.refreshedAt,
  };
}

/**
 * Prisma-backed {@link AlumniEngagementProfileRepository} (RLS via {@link withTenant}; soft delete). The
 * profile is a re-derivable projection — one per alumnus, upserted by the refresh spine.
 */
export class PrismaAlumniEngagementProfileRepository implements AlumniEngagementProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findByAlumnus(
    tenantId: TenantId,
    alumniProfileId: Uuid,
  ): Promise<AlumniEngagementProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.alumniEngagementProfile.findFirst({
        where: { alumniProfileId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<AlumniEngagementProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.alumniEngagementProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: AlumniEngagementProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.alumniEngagementProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }
}
