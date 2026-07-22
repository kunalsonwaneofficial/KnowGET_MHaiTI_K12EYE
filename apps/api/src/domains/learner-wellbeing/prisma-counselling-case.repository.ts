import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  CounsellingCase,
  CounsellingCaseRepository,
  CounsellingCaseStatus,
  CounsellingGoal,
  CounsellingPriority,
  CounsellingReferral,
  CounsellingSession,
} from "@knowget/learner-wellbeing";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface CounsellingCaseRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  counsellorId: string;
  presentingConcern: string;
  priority: string;
  status: string;
  sessions: unknown;
  referrals: unknown;
  goals: unknown;
  outcome: string | null;
  openedAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CounsellingCaseRow): CounsellingCase {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    counsellorId: row.counsellorId as Uuid,
    presentingConcern: row.presentingConcern,
    priority: row.priority as CounsellingPriority,
    status: row.status as CounsellingCaseStatus,
    sessions: (row.sessions as CounsellingSession[]) ?? [],
    referrals: (row.referrals as CounsellingReferral[]) ?? [],
    goals: (row.goals as CounsellingGoal[]) ?? [],
    outcome: row.outcome,
    openedAt: toIso(row.openedAt),
    closedAt: row.closedAt ? toIso(row.closedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(kase: CounsellingCase) {
  return {
    tenantId: kase.tenantId,
    organizationId: kase.organizationId,
    studentId: kase.studentId,
    counsellorId: kase.counsellorId,
    presentingConcern: kase.presentingConcern,
    priority: kase.priority,
    status: kase.status,
    sessions: JSON.parse(JSON.stringify(kase.sessions)),
    referrals: JSON.parse(JSON.stringify(kase.referrals)),
    goals: JSON.parse(JSON.stringify(kase.goals)),
    outcome: kase.outcome,
    openedAt: new Date(kase.openedAt),
    closedAt: kase.closedAt ? new Date(kase.closedAt) : null,
  };
}

/** Prisma-backed {@link CounsellingCaseRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaCounsellingCaseRepository implements CounsellingCaseRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CounsellingCase | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.counsellingCase.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<CounsellingCase[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.counsellingCase.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByCounsellor(tenantId: TenantId, counsellorId: Uuid): Promise<CounsellingCase[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.counsellingCase.findMany({ where: { counsellorId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<CounsellingCase[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.counsellingCase.findMany({
        where: { organizationId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CounsellingCase[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.counsellingCase.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(kase: CounsellingCase): Promise<void> {
    return withTenant(this.db, kase.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(kase);
      await tx.counsellingCase.upsert({
        where: { id: kase.id },
        create: { id: kase.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.counsellingCase.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
