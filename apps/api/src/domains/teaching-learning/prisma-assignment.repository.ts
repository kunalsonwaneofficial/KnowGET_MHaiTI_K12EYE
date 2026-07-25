import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type {
  Assignment,
  AssignmentRepository,
  AssignmentStatus,
  AssignmentSubmission,
  AssignmentType,
} from "@knowget/teaching-learning";
import type { TenantId, Uuid } from "@knowget/types";

interface AssignmentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subjectId: string;
  sectionId: string | null;
  lessonPlanId: string | null;
  title: string;
  assignmentType: string;
  instructions: string | null;
  assignedDate: string | null;
  dueDate: string | null;
  submissionOpensAt: string | null;
  submissionClosesAt: string | null;
  status: string;
  submissions: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AssignmentRow): Assignment {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subjectId: row.subjectId as Uuid,
    sectionId: row.sectionId as Uuid | null,
    lessonPlanId: row.lessonPlanId as Uuid | null,
    title: row.title,
    assignmentType: row.assignmentType as AssignmentType,
    instructions: row.instructions,
    assignedDate: row.assignedDate,
    dueDate: row.dueDate,
    submissionOpensAt: row.submissionOpensAt,
    submissionClosesAt: row.submissionClosesAt,
    status: row.status as AssignmentStatus,
    submissions: (row.submissions as AssignmentSubmission[]) ?? [],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(assignment: Assignment) {
  return {
    tenantId: assignment.tenantId,
    organizationId: assignment.organizationId,
    subjectId: assignment.subjectId,
    sectionId: assignment.sectionId,
    lessonPlanId: assignment.lessonPlanId,
    title: assignment.title,
    assignmentType: assignment.assignmentType,
    instructions: assignment.instructions,
    assignedDate: assignment.assignedDate,
    dueDate: assignment.dueDate,
    submissionOpensAt: assignment.submissionOpensAt,
    submissionClosesAt: assignment.submissionClosesAt,
    status: assignment.status,
    submissions: JSON.parse(JSON.stringify(assignment.submissions)),
  };
}

/** Prisma-backed {@link AssignmentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAssignmentRepository implements AssignmentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Assignment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.assignment.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySection(tenantId: TenantId, sectionId: Uuid): Promise<Assignment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assignment.findMany({ where: { sectionId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listBySubject(tenantId: TenantId, subjectId: Uuid): Promise<Assignment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assignment.findMany({ where: { subjectId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Assignment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assignment.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Assignment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assignment.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(assignment: Assignment): Promise<void> {
    return withTenant(this.db, assignment.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(assignment);
      await tx.assignment.upsert({
        where: { id: assignment.id },
        create: { id: assignment.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.assignment.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
