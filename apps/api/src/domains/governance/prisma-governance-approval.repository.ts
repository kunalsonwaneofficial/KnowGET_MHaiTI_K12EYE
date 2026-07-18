import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  ApprovalHistoryEntry,
  ApprovalKind,
  ApprovalState,
  GovernanceApproval,
  GovernanceApprovalRepository,
} from "@knowget/governance";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ApprovalRow {
  id: string;
  tenantId: string;
  organizationId: string;
  kind: string;
  subjectId: string;
  state: string;
  status: string;
  submittedById: string;
  decidedById: string | null;
  note: string | null;
  history: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ApprovalRow): GovernanceApproval {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    kind: row.kind as ApprovalKind,
    subjectId: row.subjectId as Uuid,
    state: row.state as ApprovalState,
    status: row.status as GovernanceApproval["status"],
    submittedById: row.submittedById as Uuid,
    decidedById: row.decidedById as Uuid | null,
    note: row.note,
    history: (row.history as ApprovalHistoryEntry[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(approval: GovernanceApproval) {
  return {
    tenantId: approval.tenantId,
    organizationId: approval.organizationId,
    kind: approval.kind,
    subjectId: approval.subjectId,
    state: approval.state,
    status: approval.status,
    submittedById: approval.submittedById,
    decidedById: approval.decidedById,
    note: approval.note,
    history: JSON.parse(JSON.stringify(approval.history)),
  };
}

/** Prisma-backed {@link GovernanceApprovalRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGovernanceApprovalRepository implements GovernanceApprovalRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<GovernanceApproval | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governanceApproval.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(
    tenantId: TenantId,
    kind: ApprovalKind,
    subjectId: Uuid,
  ): Promise<GovernanceApproval[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceApproval.findMany({
        where: { kind, subjectId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<GovernanceApproval[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceApproval.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<GovernanceApproval[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceApproval.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(approval: GovernanceApproval): Promise<void> {
    return withTenant(this.db, approval.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(approval);
      await tx.governanceApproval.upsert({
        where: { id: approval.id },
        create: { id: approval.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.governanceApproval.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
