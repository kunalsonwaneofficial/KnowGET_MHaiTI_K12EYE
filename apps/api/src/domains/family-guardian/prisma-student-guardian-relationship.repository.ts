import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  ResponsibilityProfile,
  StudentGuardianRelationship,
  StudentGuardianRelationshipRepository,
  StudentGuardianRelationshipType,
} from "@knowget/family-guardian";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface RelationshipRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  guardianId: string;
  relationshipType: string;
  responsibilities: unknown;
  emergencyPriority: number | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RelationshipRow): StudentGuardianRelationship {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    guardianId: row.guardianId as Uuid,
    relationshipType: row.relationshipType as StudentGuardianRelationshipType,
    responsibilities: row.responsibilities as ResponsibilityProfile,
    emergencyPriority: row.emergencyPriority,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
    status: row.status as StudentGuardianRelationship["status"],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(relationship: StudentGuardianRelationship) {
  return {
    tenantId: relationship.tenantId,
    organizationId: relationship.organizationId,
    studentId: relationship.studentId,
    guardianId: relationship.guardianId,
    relationshipType: relationship.relationshipType,
    responsibilities: JSON.parse(JSON.stringify(relationship.responsibilities)),
    emergencyPriority: relationship.emergencyPriority,
    effectiveFrom: new Date(relationship.effectiveFrom),
    effectiveTo: relationship.effectiveTo ? new Date(relationship.effectiveTo) : null,
    status: relationship.status,
  };
}

/** Prisma-backed {@link StudentGuardianRelationshipRepository} (RLS via {@link withTenant}). */
export class PrismaStudentGuardianRelationshipRepository implements StudentGuardianRelationshipRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<StudentGuardianRelationship | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentGuardianRelationship.findFirst({
        where: { id, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findActive(
    tenantId: TenantId,
    studentId: Uuid,
    guardianId: Uuid,
  ): Promise<StudentGuardianRelationship | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.studentGuardianRelationship.findFirst({
        where: { studentId, guardianId, status: "active", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<StudentGuardianRelationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentGuardianRelationship.findMany({
        where: { studentId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByGuardian(tenantId: TenantId, guardianId: Uuid): Promise<StudentGuardianRelationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentGuardianRelationship.findMany({
        where: { guardianId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<StudentGuardianRelationship[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.studentGuardianRelationship.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(relationship: StudentGuardianRelationship): Promise<void> {
    return withTenant(this.db, relationship.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(relationship);
      await tx.studentGuardianRelationship.upsert({
        where: { id: relationship.id },
        create: { id: relationship.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.studentGuardianRelationship.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    });
  }
}
