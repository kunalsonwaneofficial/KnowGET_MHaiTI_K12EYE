import type { Application, ApplicationRepository, ApplicationStatus } from "@knowget/admissions";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ApplicationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  cycleId: string;
  applicantPersonId: string;
  leadId: string | null;
  code: string;
  gradeApplyingFor: string;
  status: string;
  submittedOn: string;
  decidedOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ApplicationRow): Application {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    cycleId: row.cycleId as Uuid,
    applicantPersonId: row.applicantPersonId as Uuid,
    leadId: (row.leadId as Uuid | null) ?? null,
    code: row.code,
    gradeApplyingFor: row.gradeApplyingFor,
    status: row.status as ApplicationStatus,
    submittedOn: row.submittedOn,
    decidedOn: row.decidedOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(application: Application) {
  return {
    tenantId: application.tenantId,
    organizationId: application.organizationId,
    cycleId: application.cycleId,
    applicantPersonId: application.applicantPersonId,
    leadId: application.leadId,
    code: application.code,
    gradeApplyingFor: application.gradeApplyingFor,
    status: application.status,
    submittedOn: application.submittedOn,
    decidedOn: application.decidedOn,
  };
}

/** Prisma-backed {@link ApplicationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaApplicationRepository implements ApplicationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Application | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.application.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Application | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.application.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByCycle(tenantId: TenantId, cycleId: Uuid): Promise<Application[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.application.findMany({ where: { cycleId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  countByCycle(tenantId: TenantId, cycleId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.application.count({ where: { cycleId, deletedAt: null } });
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Application[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.application.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Application[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.application.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(application: Application): Promise<void> {
    return withTenant(this.db, application.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(application);
      await tx.application.upsert({
        where: { id: application.id },
        create: { id: application.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.application.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
