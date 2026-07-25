import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Invoice, InvoiceLine, InvoiceRepository, InvoiceStatus } from "@knowget/financial";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface InvoiceRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  feeStructureId: string | null;
  number: string;
  currency: string;
  lines: unknown;
  status: string;
  amountPaidMinor: bigint;
  dueDate: string;
  notes: string | null;
  issuedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: InvoiceRow): Invoice {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    feeStructureId: (row.feeStructureId as Uuid | null) ?? null,
    number: row.number,
    currency: row.currency,
    lines: (row.lines as InvoiceLine[]) ?? [],
    status: row.status as InvoiceStatus,
    amountPaidMinor: Number(row.amountPaidMinor),
    dueDate: row.dueDate,
    notes: row.notes,
    issuedAt: (row.issuedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(invoice: Invoice) {
  return {
    tenantId: invoice.tenantId,
    organizationId: invoice.organizationId,
    studentId: invoice.studentId,
    feeStructureId: invoice.feeStructureId,
    number: invoice.number,
    currency: invoice.currency,
    lines: JSON.parse(JSON.stringify(invoice.lines)),
    status: invoice.status,
    amountPaidMinor: BigInt(invoice.amountPaidMinor),
    dueDate: invoice.dueDate,
    notes: invoice.notes,
    issuedAt: invoice.issuedAt,
  };
}

/** Prisma-backed {@link InvoiceRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Invoice | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.invoice.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByNumber(tenantId: TenantId, number: string): Promise<Invoice | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.invoice.findFirst({ where: { number, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Invoice[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.invoice.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Invoice[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.invoice.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Invoice[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.invoice.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(invoice: Invoice): Promise<void> {
    return withTenant(this.db, invoice.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(invoice);
      await tx.invoice.upsert({
        where: { id: invoice.id },
        create: { id: invoice.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
