import type {
  PolicyRevision,
  PolicyRuleType,
  SchedulingPolicy,
  SchedulingPolicyRepository,
  SchedulingPolicyStatus,
} from "@knowget/academic-scheduling";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface SchedulingPolicyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  ruleType: string;
  parameters: unknown;
  description: string | null;
  version: number;
  status: string;
  revisions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SchedulingPolicyRow): SchedulingPolicy {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    ruleType: row.ruleType as PolicyRuleType,
    parameters: (row.parameters as Record<string, unknown>) ?? {},
    description: row.description,
    version: row.version,
    status: row.status as SchedulingPolicyStatus,
    revisions: (row.revisions as PolicyRevision[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(policy: SchedulingPolicy) {
  return {
    tenantId: policy.tenantId,
    organizationId: policy.organizationId,
    code: policy.code,
    name: policy.name,
    ruleType: policy.ruleType,
    parameters: JSON.parse(JSON.stringify(policy.parameters)),
    description: policy.description,
    version: policy.version,
    status: policy.status,
    revisions: JSON.parse(JSON.stringify(policy.revisions)),
  };
}

/** Prisma-backed {@link SchedulingPolicyRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaSchedulingPolicyRepository implements SchedulingPolicyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SchedulingPolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.schedulingPolicy.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<SchedulingPolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.schedulingPolicy.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SchedulingPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.schedulingPolicy.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<SchedulingPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.schedulingPolicy.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listActiveForConflict(tenantId: TenantId, organizationId: Uuid): Promise<SchedulingPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.schedulingPolicy.findMany({
        where: { organizationId, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  save(policy: SchedulingPolicy): Promise<void> {
    return withTenant(this.db, policy.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(policy);
      await tx.schedulingPolicy.upsert({
        where: { id: policy.id },
        create: { id: policy.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.schedulingPolicy.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
