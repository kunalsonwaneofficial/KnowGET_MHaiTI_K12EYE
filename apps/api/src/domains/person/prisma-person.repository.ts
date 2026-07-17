import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ContactPoint,
  type Gender,
  matchKey,
  type Person,
  type PersonRepository,
  type PersonStatus,
} from "@knowget/person";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

/** The database row shape (Prisma model fields) for a person. */
interface PersonRow {
  id: string;
  tenantId: string;
  givenName: string;
  familyName: string;
  middleName: string | null;
  preferredName: string | null;
  dateOfBirth: Date | null;
  gender: string;
  status: string;
  contacts: unknown;
  mergedInto: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PersonRow): Person {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    name: {
      given: row.givenName,
      family: row.familyName,
      ...(row.middleName !== null ? { middle: row.middleName } : {}),
      ...(row.preferredName !== null ? { preferred: row.preferredName } : {}),
    },
    dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    gender: row.gender as Gender,
    status: row.status as PersonStatus,
    contacts: (row.contacts as ContactPoint[] | null) ?? [],
    mergedInto: (row.mergedInto as Uuid | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Persisted (Prisma) fields for a person; contacts are stored as JSONB. */
function toFields(person: Person): Record<string, unknown> {
  return {
    tenantId: person.tenantId,
    givenName: person.name.given,
    familyName: person.name.family,
    middleName: person.name.middle ?? null,
    preferredName: person.name.preferred ?? null,
    dateOfBirth: person.dateOfBirth ? new Date(person.dateOfBirth) : null,
    gender: person.gender,
    status: person.status,
    // Plain JSON (strips branding); assignable to Prisma's Json input.
    contacts: JSON.parse(JSON.stringify(person.contacts)),
    matchKey: matchKey(person.name, person.dateOfBirth),
    mergedInto: person.mergedInto,
  };
}

/**
 * Prisma-backed {@link PersonRepository}. Every operation runs inside
 * {@link withTenant} so PostgreSQL RLS scopes the query to the caller's tenant
 * (defense-in-depth with the explicit tenant argument). Deletes are soft; reads
 * exclude soft-deleted rows. Contacts persist as JSONB; `match_key` is stored
 * for indexed duplicate detection.
 */
export class PrismaPersonRepository implements PersonRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Person | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.person.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByMatchKey(tenantId: TenantId, key: string): Promise<Person[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.person.findMany({ where: { matchKey: key, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Person[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.person.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(person: Person): Promise<void> {
    return withTenant(this.db, person.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(person);
      await tx.person.upsert({
        where: { id: person.id },
        create: { id: person.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.person.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
