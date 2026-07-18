import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Committee,
  CommitteeMember,
  CommitteeRepository,
  CommitteeStatus,
} from "@knowget/governance";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CommitteeRow {
  id: string;
  tenantId: string;
  organizationId: string;
  governanceBodyId: string | null;
  name: string;
  purpose: string | null;
  termsOfReference: string | null;
  members: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CommitteeRow): Committee {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    governanceBodyId: row.governanceBodyId as Uuid | null,
    name: row.name,
    purpose: row.purpose,
    termsOfReference: row.termsOfReference,
    members: (row.members as CommitteeMember[]) ?? [],
    status: row.status as CommitteeStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(committee: Committee) {
  return {
    tenantId: committee.tenantId,
    organizationId: committee.organizationId,
    governanceBodyId: committee.governanceBodyId,
    name: committee.name,
    purpose: committee.purpose,
    termsOfReference: committee.termsOfReference,
    members: JSON.parse(JSON.stringify(committee.members)),
    status: committee.status,
  };
}

/** Prisma-backed {@link CommitteeRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGovernanceCommitteeRepository implements CommitteeRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Committee | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governanceCommittee.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Committee[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceCommittee.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByGovernanceBody(tenantId: TenantId, governanceBodyId: Uuid): Promise<Committee[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceCommittee.findMany({
        where: { governanceBodyId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Committee[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceCommittee.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(committee: Committee): Promise<void> {
    return withTenant(this.db, committee.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(committee);
      await tx.governanceCommittee.upsert({
        where: { id: committee.id },
        create: { id: committee.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.governanceCommittee.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
