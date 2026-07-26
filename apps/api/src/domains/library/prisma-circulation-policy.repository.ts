import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CategoryRule,
  CirculationPolicy,
  CirculationPolicyRepository,
  DefaultRule,
  PolicyStatus,
} from "@knowget/library";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CirculationPolicyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  defaultRule: unknown;
  rules: unknown;
  version: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CirculationPolicyRow): CirculationPolicy {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    name: row.name,
    defaultRule: row.defaultRule as DefaultRule,
    rules: (row.rules as CategoryRule[]) ?? [],
    version: row.version,
    status: row.status as PolicyStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(policy: CirculationPolicy) {
  return {
    tenantId: policy.tenantId,
    organizationId: policy.organizationId,
    name: policy.name,
    defaultRule: JSON.parse(JSON.stringify(policy.defaultRule)),
    rules: JSON.parse(JSON.stringify(policy.rules)),
    version: policy.version,
    status: policy.status,
  };
}

/**
 * Prisma-backed {@link CirculationPolicyRepository} (RLS via {@link withTenant}; default rule + per-category
 * rules JSONB; soft delete).
 */
export class PrismaCirculationPolicyRepository implements CirculationPolicyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CirculationPolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.circulationPolicy.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<CirculationPolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.circulationPolicy.findFirst({
        where: { organizationId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CirculationPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.circulationPolicy.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CirculationPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.circulationPolicy.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(policy: CirculationPolicy): Promise<void> {
    return withTenant(this.db, policy.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(policy);
      await tx.circulationPolicy.upsert({
        where: { id: policy.id },
        create: { id: policy.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.circulationPolicy.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
