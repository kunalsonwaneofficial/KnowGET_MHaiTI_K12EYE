import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  LeadSource,
  Prospect,
  ProspectFollowUp,
  ProspectRepository,
  ProspectStatus,
} from "@knowget/student-lifecycle";
import type { TenantId, Uuid } from "@knowget/types";

interface ProspectRow {
  id: string;
  tenantId: string;
  organizationId: string;
  personId: string;
  leadSource: string;
  campaign: string | null;
  interests: string[];
  status: string;
  followUps: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ProspectRow): Prospect {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    personId: row.personId as Uuid,
    leadSource: row.leadSource as LeadSource,
    campaign: row.campaign,
    interests: (row.interests as string[]) ?? [],
    status: row.status as ProspectStatus,
    followUps: (row.followUps as ProspectFollowUp[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(prospect: Prospect) {
  return {
    tenantId: prospect.tenantId,
    organizationId: prospect.organizationId,
    personId: prospect.personId,
    leadSource: prospect.leadSource,
    campaign: prospect.campaign,
    interests: [...prospect.interests],
    status: prospect.status,
    followUps: JSON.parse(JSON.stringify(prospect.followUps)),
  };
}

/** Prisma-backed {@link ProspectRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaStudentProspectRepository implements ProspectRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Prospect | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentProspect.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Prospect[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentProspect.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Prospect[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentProspect.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(prospect: Prospect): Promise<void> {
    return withTenant(this.db, prospect.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(prospect);
      await tx.studentProspect.upsert({
        where: { id: prospect.id },
        create: { id: prospect.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.studentProspect.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
