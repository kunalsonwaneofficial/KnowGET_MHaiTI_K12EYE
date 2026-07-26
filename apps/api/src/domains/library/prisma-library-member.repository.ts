import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  LibraryMember,
  LibraryMemberRepository,
  MemberCategory,
  MemberStatus,
} from "@knowget/library";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface LibraryMemberRow {
  id: string;
  tenantId: string;
  organizationId: string;
  personId: string;
  membershipNumber: string;
  category: string;
  joinedOn: string;
  expiresOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: LibraryMemberRow): LibraryMember {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    personId: row.personId as Uuid,
    membershipNumber: row.membershipNumber,
    category: row.category as MemberCategory,
    joinedOn: row.joinedOn,
    expiresOn: row.expiresOn,
    status: row.status as MemberStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(member: LibraryMember) {
  return {
    tenantId: member.tenantId,
    organizationId: member.organizationId,
    personId: member.personId,
    membershipNumber: member.membershipNumber,
    category: member.category,
    joinedOn: member.joinedOn,
    expiresOn: member.expiresOn,
    status: member.status,
  };
}

/** Prisma-backed {@link LibraryMemberRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaLibraryMemberRepository implements LibraryMemberRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<LibraryMember | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.libraryMember.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByMembershipNumber(
    tenantId: TenantId,
    membershipNumber: string,
  ): Promise<LibraryMember | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.libraryMember.findFirst({
        where: { membershipNumber, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findByPersonAndOrganization(
    tenantId: TenantId,
    personId: Uuid,
    organizationId: Uuid,
  ): Promise<LibraryMember | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.libraryMember.findFirst({
        where: { personId, organizationId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<LibraryMember[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.libraryMember.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<LibraryMember[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.libraryMember.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(member: LibraryMember): Promise<void> {
    return withTenant(this.db, member.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(member);
      await tx.libraryMember.upsert({
        where: { id: member.id },
        create: { id: member.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.libraryMember.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
