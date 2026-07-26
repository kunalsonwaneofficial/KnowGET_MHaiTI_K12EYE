import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  RollCall,
  RollCallMark,
  RollCallRepository,
  RollCallStatus,
} from "@knowget/residential";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface RollCallRow {
  id: string;
  tenantId: string;
  organizationId: string;
  hostelId: string;
  scheduledFor: string;
  expectedResidentIds: unknown;
  marks: unknown;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RollCallRow): RollCall {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    hostelId: row.hostelId as Uuid,
    scheduledFor: row.scheduledFor,
    expectedResidentIds: (row.expectedResidentIds as Uuid[]) ?? [],
    marks: (row.marks as RollCallMark[]) ?? [],
    status: row.status as RollCallStatus,
    startedAt: (row.startedAt as ISODateString | null) ?? null,
    completedAt: (row.completedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(rollCall: RollCall) {
  return {
    tenantId: rollCall.tenantId,
    organizationId: rollCall.organizationId,
    hostelId: rollCall.hostelId,
    scheduledFor: rollCall.scheduledFor,
    expectedResidentIds: JSON.parse(JSON.stringify(rollCall.expectedResidentIds)),
    marks: JSON.parse(JSON.stringify(rollCall.marks)),
    status: rollCall.status,
    startedAt: rollCall.startedAt,
    completedAt: rollCall.completedAt,
  };
}

/** Prisma-backed {@link RollCallRepository} (RLS via {@link withTenant}; soft delete; roster/marks JSONB). */
export class PrismaRollCallRepository implements RollCallRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<RollCall | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.rollCall.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<RollCall[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.rollCall.findMany({ where: { hostelId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<RollCall[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.rollCall.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<RollCall[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.rollCall.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(rollCall: RollCall): Promise<void> {
    return withTenant(this.db, rollCall.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(rollCall);
      await tx.rollCall.upsert({
        where: { id: rollCall.id },
        create: { id: rollCall.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.rollCall.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
