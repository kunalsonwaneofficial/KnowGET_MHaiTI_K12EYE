import type {
  AttendancePolicy,
  AttendancePolicyRepository,
  AttendancePolicyRevision,
  AttendancePolicyRuleType,
  AttendancePolicyStatus,
} from "@knowget/attendance-presence";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AttendancePolicyRow {
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

function toDomain(row: AttendancePolicyRow): AttendancePolicy {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    ruleType: row.ruleType as AttendancePolicyRuleType,
    parameters: (row.parameters as Record<string, unknown>) ?? {},
    description: row.description,
    version: row.version,
    status: row.status as AttendancePolicyStatus,
    revisions: (row.revisions as AttendancePolicyRevision[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(policy: AttendancePolicy) {
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

/** Prisma-backed {@link AttendancePolicyRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAttendancePolicyRepository implements AttendancePolicyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AttendancePolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.attendancePolicy.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(
    tenantId: TenantId,
    organizationId: Uuid,
    code: string,
  ): Promise<AttendancePolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.attendancePolicy.findFirst({
        where: { organizationId, code, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AttendancePolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attendancePolicy.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AttendancePolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attendancePolicy.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listActiveForEvaluation(tenantId: TenantId, organizationId: Uuid): Promise<AttendancePolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attendancePolicy.findMany({
        where: { organizationId, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  save(policy: AttendancePolicy): Promise<void> {
    return withTenant(this.db, policy.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(policy);
      await tx.attendancePolicy.upsert({
        where: { id: policy.id },
        create: { id: policy.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.attendancePolicy.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
