import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  ComfortPolicy,
  ComfortPolicyRepository,
  ComfortThreshold,
  PolicyStatus,
} from "@knowget/facilities";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ComfortPolicyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  name: string;
  version: number;
  thresholds: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ComfortPolicyRow): ComfortPolicy {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    name: row.name,
    version: row.version,
    thresholds: (row.thresholds as ComfortThreshold[] | null) ?? [],
    status: row.status as PolicyStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(policy: ComfortPolicy) {
  return {
    tenantId: policy.tenantId,
    organizationId: policy.organizationId,
    name: policy.name,
    version: policy.version,
    // Serialize to a plain JSON value for the JSONB column.
    thresholds: JSON.parse(JSON.stringify(policy.thresholds)),
    status: policy.status,
  };
}

/** Prisma-backed {@link ComfortPolicyRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaComfortPolicyRepository implements ComfortPolicyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ComfortPolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.comfortPolicy.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<ComfortPolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.comfortPolicy.findFirst({
        where: { organizationId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<ComfortPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.comfortPolicy.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ComfortPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.comfortPolicy.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(policy: ComfortPolicy): Promise<void> {
    return withTenant(this.db, policy.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(policy);
      await tx.comfortPolicy.upsert({
        where: { id: policy.id },
        create: { id: policy.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.comfortPolicy.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
