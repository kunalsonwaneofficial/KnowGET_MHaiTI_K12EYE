import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  AuthorityScope,
  Delegation,
  DelegationRepository,
  DelegationStatus,
} from "@knowget/governance";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface DelegationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  delegatorId: string;
  delegateId: string;
  scope: string;
  description: string | null;
  monetaryLimit: bigint | null;
  status: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  grantedOn: Date;
  revokedOn: Date | null;
  revokedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date): string => value.toISOString().slice(0, 10);
const toDateOrNull = (value: Date | null): string | null => (value ? toDate(value) : null);

function toDomain(row: DelegationRow): Delegation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    delegatorId: row.delegatorId as Uuid,
    delegateId: row.delegateId as Uuid,
    scope: row.scope as AuthorityScope,
    description: row.description,
    monetaryLimit: row.monetaryLimit === null ? null : Number(row.monetaryLimit),
    status: row.status as DelegationStatus,
    effectiveFrom: toDate(row.effectiveFrom),
    effectiveUntil: toDateOrNull(row.effectiveUntil),
    grantedOn: toDate(row.grantedOn),
    revokedOn: toDateOrNull(row.revokedOn),
    revokedReason: row.revokedReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(delegation: Delegation) {
  return {
    tenantId: delegation.tenantId,
    organizationId: delegation.organizationId,
    delegatorId: delegation.delegatorId,
    delegateId: delegation.delegateId,
    scope: delegation.scope,
    description: delegation.description,
    monetaryLimit: delegation.monetaryLimit,
    status: delegation.status,
    effectiveFrom: new Date(delegation.effectiveFrom),
    effectiveUntil: delegation.effectiveUntil ? new Date(delegation.effectiveUntil) : null,
    grantedOn: new Date(delegation.grantedOn),
    revokedOn: delegation.revokedOn ? new Date(delegation.revokedOn) : null,
    revokedReason: delegation.revokedReason,
  };
}

/** Prisma-backed {@link DelegationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGovernanceDelegationRepository implements DelegationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Delegation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governanceDelegation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Delegation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceDelegation.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByDelegate(tenantId: TenantId, delegateId: Uuid): Promise<Delegation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceDelegation.findMany({
        where: { delegateId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Delegation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceDelegation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(delegation: Delegation): Promise<void> {
    return withTenant(this.db, delegation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(delegation);
      await tx.governanceDelegation.upsert({
        where: { id: delegation.id },
        create: { id: delegation.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.governanceDelegation.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
