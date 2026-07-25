import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import type {
  ContractStatus,
  EmploymentContract,
  EmploymentContractRepository,
  EmploymentType,
} from "@knowget/workforce";

interface EmploymentContractRow {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  version: number;
  employmentType: string;
  grade: string | null;
  startDate: string;
  endDate: string | null;
  terms: string | null;
  status: string;
  supersedesContractId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EmploymentContractRow): EmploymentContract {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    employeeId: row.employeeId as Uuid,
    version: row.version,
    employmentType: row.employmentType as EmploymentType,
    grade: row.grade,
    startDate: row.startDate,
    endDate: row.endDate,
    terms: row.terms,
    status: row.status as ContractStatus,
    supersedesContractId: (row.supersedesContractId as Uuid | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(contract: EmploymentContract) {
  return {
    tenantId: contract.tenantId,
    organizationId: contract.organizationId,
    employeeId: contract.employeeId,
    version: contract.version,
    employmentType: contract.employmentType,
    grade: contract.grade,
    startDate: contract.startDate,
    endDate: contract.endDate,
    terms: contract.terms,
    status: contract.status,
    supersedesContractId: contract.supersedesContractId,
  };
}

/** Prisma-backed {@link EmploymentContractRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEmploymentContractRepository implements EmploymentContractRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EmploymentContract | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.employmentContract.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findActiveByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<EmploymentContract | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.employmentContract.findFirst({
        where: { employeeId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByEmployee(tenantId: TenantId, employeeId: Uuid): Promise<EmploymentContract[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.employmentContract.findMany({
        where: { employeeId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EmploymentContract[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.employmentContract.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(contract: EmploymentContract): Promise<void> {
    return withTenant(this.db, contract.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(contract);
      await tx.employmentContract.upsert({
        where: { id: contract.id },
        create: { id: contract.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.employmentContract.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
