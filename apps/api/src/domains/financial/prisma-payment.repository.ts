import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type { Payment, PaymentMethod, PaymentRepository, PaymentStatus } from "@knowget/financial";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface PaymentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  studentId: string;
  invoiceId: string;
  amountMinor: bigint;
  currency: string;
  method: string;
  reference: string | null;
  status: string;
  receivedAt: string;
  clearedAt: string | null;
  refundedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: PaymentRow): Payment {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    studentId: row.studentId as Uuid,
    invoiceId: row.invoiceId as Uuid,
    amountMinor: Number(row.amountMinor),
    currency: row.currency,
    method: row.method as PaymentMethod,
    reference: row.reference,
    status: row.status as PaymentStatus,
    receivedAt: row.receivedAt,
    clearedAt: (row.clearedAt as ISODateString | null) ?? null,
    refundedAt: (row.refundedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(payment: Payment) {
  return {
    tenantId: payment.tenantId,
    organizationId: payment.organizationId,
    studentId: payment.studentId,
    invoiceId: payment.invoiceId,
    amountMinor: BigInt(payment.amountMinor),
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    status: payment.status,
    receivedAt: payment.receivedAt,
    clearedAt: payment.clearedAt,
    refundedAt: payment.refundedAt,
  };
}

/** Prisma-backed {@link PaymentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Payment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.payment.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByInvoice(tenantId: TenantId, invoiceId: Uuid): Promise<Payment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.payment.findMany({ where: { invoiceId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByStudent(tenantId: TenantId, studentId: Uuid): Promise<Payment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.payment.findMany({ where: { studentId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Payment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.payment.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(payment: Payment): Promise<void> {
    return withTenant(this.db, payment.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(payment);
      await tx.payment.upsert({
        where: { id: payment.id },
        create: { id: payment.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
