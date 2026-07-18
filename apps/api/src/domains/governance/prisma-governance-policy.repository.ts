import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Policy,
  PolicyAcknowledgment,
  PolicyAcknowledgmentRepository,
  PolicyCategory,
  PolicyRepository,
  PolicyStatus,
} from "@knowget/governance";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface PolicyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  category: string;
  title: string;
  body: string;
  version: number;
  status: string;
  ownerId: string;
  effectiveOn: Date | null;
  approvedOn: Date | null;
  publishedOn: Date | null;
  retiredOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const toDate = (value: Date | null): string | null =>
  value ? value.toISOString().slice(0, 10) : null;

const fromDate = (value: string | null): Date | null => (value ? new Date(value) : null);

function toDomain(row: PolicyRow): Policy {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    category: row.category as PolicyCategory,
    title: row.title,
    body: row.body,
    version: row.version,
    status: row.status as PolicyStatus,
    ownerId: row.ownerId as Uuid,
    effectiveOn: toDate(row.effectiveOn),
    approvedOn: toDate(row.approvedOn),
    publishedOn: toDate(row.publishedOn),
    retiredOn: toDate(row.retiredOn),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(policy: Policy) {
  return {
    tenantId: policy.tenantId,
    organizationId: policy.organizationId,
    category: policy.category,
    title: policy.title,
    body: policy.body,
    version: policy.version,
    status: policy.status,
    ownerId: policy.ownerId,
    effectiveOn: fromDate(policy.effectiveOn),
    approvedOn: fromDate(policy.approvedOn),
    publishedOn: fromDate(policy.publishedOn),
    retiredOn: fromDate(policy.retiredOn),
  };
}

/** Prisma-backed {@link PolicyRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGovernancePolicyRepository implements PolicyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Policy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governancePolicy.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Policy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governancePolicy.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listPublishedByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Policy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governancePolicy.findMany({
        where: { organizationId, status: "published", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Policy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governancePolicy.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(policy: Policy): Promise<void> {
    return withTenant(this.db, policy.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(policy);
      await tx.governancePolicy.upsert({
        where: { id: policy.id },
        create: { id: policy.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.governancePolicy.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}

interface AcknowledgmentRow {
  tenantId: string;
  policyId: string;
  personId: string;
  version: number;
  acknowledgedOn: Date;
}

const toAcknowledgment = (row: AcknowledgmentRow): PolicyAcknowledgment => ({
  tenantId: row.tenantId as TenantId,
  policyId: row.policyId as Uuid,
  personId: row.personId as Uuid,
  version: row.version,
  acknowledgedOn: toIso(row.acknowledgedOn) as ISODateString,
});

/** Prisma-backed {@link PolicyAcknowledgmentRepository} (RLS via {@link withTenant}). */
export class PrismaGovernancePolicyAcknowledgmentRepository implements PolicyAcknowledgmentRepository {
  constructor(private readonly db: PrismaService) {}

  save(acknowledgment: PolicyAcknowledgment): Promise<void> {
    const { tenantId, policyId, personId, version } = acknowledgment;
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const acknowledgedOn = new Date(acknowledgment.acknowledgedOn);
      await tx.governancePolicyAcknowledgment.upsert({
        where: { tenantId_policyId_personId_version: { tenantId, policyId, personId, version } },
        create: { tenantId, policyId, personId, version, acknowledgedOn },
        update: { acknowledgedOn },
      });
    });
  }

  listByPolicy(tenantId: TenantId, policyId: Uuid): Promise<PolicyAcknowledgment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governancePolicyAcknowledgment.findMany({ where: { policyId } });
      return rows.map(toAcknowledgment);
    });
  }
}
