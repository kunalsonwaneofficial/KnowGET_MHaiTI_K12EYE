import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  FeeComponent,
  FeeStructure,
  FeeStructureRepository,
  FeeStructureStatus,
} from "@knowget/financial";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface FeeStructureRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  academicYear: string | null;
  currency: string;
  components: unknown;
  status: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: FeeStructureRow): FeeStructure {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    academicYear: row.academicYear,
    currency: row.currency,
    components: (row.components as FeeComponent[]) ?? [],
    status: row.status as FeeStructureStatus,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(structure: FeeStructure) {
  return {
    tenantId: structure.tenantId,
    organizationId: structure.organizationId,
    code: structure.code,
    name: structure.name,
    academicYear: structure.academicYear,
    currency: structure.currency,
    components: JSON.parse(JSON.stringify(structure.components)),
    status: structure.status,
    version: structure.version,
  };
}

/** Prisma-backed {@link FeeStructureRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaFeeStructureRepository implements FeeStructureRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<FeeStructure | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.feeStructure.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<FeeStructure | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.feeStructure.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<FeeStructure[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.feeStructure.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<FeeStructure[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.feeStructure.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(structure: FeeStructure): Promise<void> {
    return withTenant(this.db, structure.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(structure);
      await tx.feeStructure.upsert({
        where: { id: structure.id },
        create: { id: structure.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.feeStructure.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
