import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";
import type {
  Employee,
  EmployeeRepository,
  EmploymentStatus,
  EmploymentType,
} from "@knowget/workforce";

interface EmployeeRow {
  id: string;
  tenantId: string;
  organizationId: string;
  personId: string;
  employeeNumber: string;
  departmentId: string | null;
  positionId: string | null;
  employmentType: string;
  status: string;
  hireDate: string;
  exitDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EmployeeRow): Employee {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    personId: row.personId as Uuid,
    employeeNumber: row.employeeNumber,
    departmentId: (row.departmentId as Uuid | null) ?? null,
    positionId: (row.positionId as Uuid | null) ?? null,
    employmentType: row.employmentType as EmploymentType,
    status: row.status as EmploymentStatus,
    hireDate: row.hireDate,
    exitDate: row.exitDate,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(employee: Employee) {
  return {
    tenantId: employee.tenantId,
    organizationId: employee.organizationId,
    personId: employee.personId,
    employeeNumber: employee.employeeNumber,
    departmentId: employee.departmentId,
    positionId: employee.positionId,
    employmentType: employee.employmentType,
    status: employee.status,
    hireDate: employee.hireDate,
    exitDate: employee.exitDate,
  };
}

/** Prisma-backed {@link EmployeeRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEmployeeRepository implements EmployeeRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Employee | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.employee.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByEmployeeNumber(tenantId: TenantId, employeeNumber: string): Promise<Employee | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.employee.findFirst({ where: { employeeNumber, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByPerson(tenantId: TenantId, personId: Uuid): Promise<Employee[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.employee.findMany({ where: { personId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByDepartment(tenantId: TenantId, departmentId: Uuid): Promise<Employee[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.employee.findMany({ where: { departmentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Employee[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.employee.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Employee[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.employee.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(employee: Employee): Promise<void> {
    return withTenant(this.db, employee.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(employee);
      await tx.employee.upsert({
        where: { id: employee.id },
        create: { id: employee.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.employee.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
