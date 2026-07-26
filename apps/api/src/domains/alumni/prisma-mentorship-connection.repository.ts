import type {
  MentorshipConnection,
  MentorshipConnectionRepository,
  MentorshipStatus,
} from "@knowget/alumni";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface MentorshipConnectionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  mentorProfileId: string;
  menteeProfileId: string;
  focus: string | null;
  status: string;
  proposedOn: string;
  startedOn: string | null;
  endedOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: MentorshipConnectionRow): MentorshipConnection {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    mentorProfileId: row.mentorProfileId as Uuid,
    menteeProfileId: row.menteeProfileId as Uuid,
    focus: row.focus,
    status: row.status as MentorshipStatus,
    proposedOn: row.proposedOn,
    startedOn: row.startedOn,
    endedOn: row.endedOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(connection: MentorshipConnection) {
  return {
    tenantId: connection.tenantId,
    organizationId: connection.organizationId,
    mentorProfileId: connection.mentorProfileId,
    menteeProfileId: connection.menteeProfileId,
    focus: connection.focus,
    status: connection.status,
    proposedOn: connection.proposedOn,
    startedOn: connection.startedOn,
    endedOn: connection.endedOn,
  };
}

/** Prisma-backed {@link MentorshipConnectionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaMentorshipConnectionRepository implements MentorshipConnectionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<MentorshipConnection | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.mentorshipConnection.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<MentorshipConnection[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.mentorshipConnection.findMany({
        where: {
          deletedAt: null,
          OR: [{ mentorProfileId: alumniProfileId }, { menteeProfileId: alumniProfileId }],
        },
      });
      return rows.map(toDomain);
    });
  }

  countActiveByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.mentorshipConnection.count({
        where: {
          status: "active",
          deletedAt: null,
          OR: [{ mentorProfileId: alumniProfileId }, { menteeProfileId: alumniProfileId }],
        },
      });
    });
  }

  listByTenant(tenantId: TenantId): Promise<MentorshipConnection[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.mentorshipConnection.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(connection: MentorshipConnection): Promise<void> {
    return withTenant(this.db, connection.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(connection);
      await tx.mentorshipConnection.upsert({
        where: { id: connection.id },
        create: { id: connection.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.mentorshipConnection.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
