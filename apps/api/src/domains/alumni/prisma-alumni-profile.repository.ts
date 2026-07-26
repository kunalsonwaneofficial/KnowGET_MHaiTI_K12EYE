import type { AlumniProfile, AlumniProfileRepository, AlumniStatus } from "@knowget/alumni";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AlumniProfileRow {
  id: string;
  tenantId: string;
  organizationId: string;
  alumnusPersonId: string;
  graduationYear: string;
  program: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AlumniProfileRow): AlumniProfile {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    alumnusPersonId: row.alumnusPersonId as Uuid,
    graduationYear: row.graduationYear,
    program: row.program,
    status: row.status as AlumniStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(profile: AlumniProfile) {
  return {
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    alumnusPersonId: profile.alumnusPersonId,
    graduationYear: profile.graduationYear,
    program: profile.program,
    status: profile.status,
  };
}

/** Prisma-backed {@link AlumniProfileRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAlumniProfileRepository implements AlumniProfileRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AlumniProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.alumniProfile.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByAlumnusPersonId(tenantId: TenantId, alumnusPersonId: Uuid): Promise<AlumniProfile | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.alumniProfile.findFirst({
        where: { alumnusPersonId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.alumniProfile.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AlumniProfile[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.alumniProfile.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(profile: AlumniProfile): Promise<void> {
    return withTenant(this.db, profile.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(profile);
      await tx.alumniProfile.upsert({
        where: { id: profile.id },
        create: { id: profile.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.alumniProfile.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
