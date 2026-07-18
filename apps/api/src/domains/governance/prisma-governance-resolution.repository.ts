import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Resolution,
  ResolutionRepository,
  ResolutionStatus,
  ResolutionVote,
} from "@knowget/governance";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ResolutionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  governanceBodyId: string;
  title: string;
  proposalText: string;
  proposedById: string;
  status: string;
  votes: unknown;
  effectiveOn: Date | null;
  approvedOn: Date | null;
  implementedOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

function toDomain(row: ResolutionRow): Resolution {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    governanceBodyId: row.governanceBodyId as Uuid,
    title: row.title,
    proposalText: row.proposalText,
    proposedById: row.proposedById as Uuid,
    status: row.status as ResolutionStatus,
    votes: (row.votes as ResolutionVote[]) ?? [],
    effectiveOn: toDate(row.effectiveOn),
    approvedOn: toDate(row.approvedOn),
    implementedOn: toDate(row.implementedOn),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(resolution: Resolution) {
  return {
    tenantId: resolution.tenantId,
    organizationId: resolution.organizationId,
    governanceBodyId: resolution.governanceBodyId,
    title: resolution.title,
    proposalText: resolution.proposalText,
    proposedById: resolution.proposedById,
    status: resolution.status,
    votes: JSON.parse(JSON.stringify(resolution.votes)),
    effectiveOn: resolution.effectiveOn ? new Date(resolution.effectiveOn) : null,
    approvedOn: resolution.approvedOn ? new Date(resolution.approvedOn) : null,
    implementedOn: resolution.implementedOn ? new Date(resolution.implementedOn) : null,
  };
}

/** Prisma-backed {@link ResolutionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGovernanceResolutionRepository implements ResolutionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Resolution | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governanceResolution.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByGovernanceBody(tenantId: TenantId, governanceBodyId: Uuid): Promise<Resolution[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceResolution.findMany({
        where: { governanceBodyId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Resolution[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceResolution.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(resolution: Resolution): Promise<void> {
    return withTenant(this.db, resolution.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(resolution);
      await tx.governanceResolution.upsert({
        where: { id: resolution.id },
        create: { id: resolution.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.governanceResolution.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
