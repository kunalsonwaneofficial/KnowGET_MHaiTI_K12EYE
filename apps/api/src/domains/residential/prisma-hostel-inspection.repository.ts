import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  HostelInspection,
  HostelInspectionRepository,
  InspectionOutcome,
  InspectionType,
} from "@knowget/residential";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface InspectionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  hostelId: string;
  type: string;
  conductedOn: string;
  outcome: string;
  nextDueOn: string;
  inspector: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: InspectionRow): HostelInspection {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    hostelId: row.hostelId as Uuid,
    type: row.type as InspectionType,
    conductedOn: row.conductedOn,
    outcome: row.outcome as InspectionOutcome,
    nextDueOn: row.nextDueOn,
    inspector: row.inspector,
    notes: row.notes,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(inspection: HostelInspection) {
  return {
    tenantId: inspection.tenantId,
    organizationId: inspection.organizationId,
    hostelId: inspection.hostelId,
    type: inspection.type,
    conductedOn: inspection.conductedOn,
    outcome: inspection.outcome,
    nextDueOn: inspection.nextDueOn,
    inspector: inspection.inspector,
    notes: inspection.notes,
  };
}

/** Prisma-backed {@link HostelInspectionRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaHostelInspectionRepository implements HostelInspectionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<HostelInspection | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.hostelInspection.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByHostelAndType(
    tenantId: TenantId,
    hostelId: Uuid,
    type: string,
  ): Promise<HostelInspection | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.hostelInspection.findFirst({
        where: { hostelId, type, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByHostel(tenantId: TenantId, hostelId: Uuid): Promise<HostelInspection[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.hostelInspection.findMany({ where: { hostelId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HostelInspection[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.hostelInspection.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<HostelInspection[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.hostelInspection.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(inspection: HostelInspection): Promise<void> {
    return withTenant(this.db, inspection.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(inspection);
      await tx.hostelInspection.upsert({
        where: { id: inspection.id },
        create: { id: inspection.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.hostelInspection.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
