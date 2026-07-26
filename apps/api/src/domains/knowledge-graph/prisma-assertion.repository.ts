import {
  type Assertion,
  type AssertionMethod,
  type AssertionRepository,
  type AssertionStatus,
  type SubjectKind,
} from "@knowget/knowledge-graph";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AssertionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subjectKind: string;
  subjectId: string;
  predicate: string;
  value: string;
  method: string;
  confidence: number;
  evidenceSource: string | null;
  evidenceRef: string | null;
  derivedFrom: string[];
  assertedOn: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AssertionRow): Assertion {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subjectKind: row.subjectKind as SubjectKind,
    subjectId: row.subjectId as Uuid,
    predicate: row.predicate,
    value: row.value,
    method: row.method as AssertionMethod,
    confidence: row.confidence,
    evidenceSource: row.evidenceSource,
    evidenceRef: row.evidenceRef,
    derivedFrom: row.derivedFrom as Uuid[],
    assertedOn: row.assertedOn,
    status: row.status as AssertionStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(a: Assertion) {
  return {
    tenantId: a.tenantId,
    organizationId: a.organizationId,
    subjectKind: a.subjectKind,
    subjectId: a.subjectId,
    predicate: a.predicate,
    value: a.value,
    method: a.method,
    confidence: a.confidence,
    evidenceSource: a.evidenceSource,
    evidenceRef: a.evidenceRef,
    derivedFrom: [...a.derivedFrom],
    assertedOn: a.assertedOn,
    status: a.status,
  };
}

/** Prisma-backed {@link AssertionRepository} (RLS via {@link withTenant}). Append-only — created and retracted. */
export class PrismaAssertionRepository implements AssertionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Assertion | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.assertion.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findManyByIds(tenantId: TenantId, ids: readonly Uuid[]): Promise<Assertion[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assertion.findMany({
        where: { id: { in: [...ids] }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listBySubject(tenantId: TenantId, subjectKind: string, subjectId: Uuid): Promise<Assertion[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assertion.findMany({
        where: { subjectKind, subjectId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Assertion[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.assertion.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(a: Assertion): Promise<void> {
    return withTenant(this.db, a.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(a);
      await tx.assertion.upsert({
        where: { id: a.id },
        create: { id: a.id, ...fields },
        update: fields,
      });
    });
  }
}
