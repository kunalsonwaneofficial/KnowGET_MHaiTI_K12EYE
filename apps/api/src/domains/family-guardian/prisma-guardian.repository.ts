import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Guardian,
  GuardianContact,
  GuardianRepository,
  GuardianStatus,
  LegalAuthorityType,
  VerificationStatus,
} from "@knowget/family-guardian";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface GuardianRow {
  id: string;
  tenantId: string;
  organizationId: string;
  personId: string;
  legalAuthority: string;
  verification: string;
  verifiedOn: Date | null;
  contacts: unknown;
  availabilityNote: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: GuardianRow): Guardian {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    personId: row.personId as Uuid,
    legalAuthority: row.legalAuthority as LegalAuthorityType,
    verification: row.verification as VerificationStatus,
    verifiedOn: row.verifiedOn ? row.verifiedOn.toISOString().slice(0, 10) : null,
    contacts: (row.contacts as GuardianContact[]) ?? [],
    availabilityNote: row.availabilityNote,
    status: row.status as GuardianStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(guardian: Guardian) {
  return {
    tenantId: guardian.tenantId,
    organizationId: guardian.organizationId,
    personId: guardian.personId,
    legalAuthority: guardian.legalAuthority,
    verification: guardian.verification,
    verifiedOn: guardian.verifiedOn ? new Date(guardian.verifiedOn) : null,
    contacts: JSON.parse(JSON.stringify(guardian.contacts)),
    availabilityNote: guardian.availabilityNote,
    status: guardian.status,
  };
}

/** Prisma-backed {@link GuardianRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaGuardianRepository implements GuardianRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Guardian | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.guardian.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByPersonAndOrganization(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<Guardian | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.guardian.findFirst({
        where: { personId, organizationId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Guardian[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.guardian.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByPerson(tenantId: TenantId, personId: Uuid): Promise<Guardian[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.guardian.findMany({ where: { personId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Guardian[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.guardian.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(guardian: Guardian): Promise<void> {
    return withTenant(this.db, guardian.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(guardian);
      await tx.guardian.upsert({
        where: { id: guardian.id },
        create: { id: guardian.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.guardian.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
