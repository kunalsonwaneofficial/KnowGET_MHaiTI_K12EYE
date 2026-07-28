import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type AttentionItem,
  type AttentionItemRepository,
  type AttentionReason,
  type AttentionSeverity,
  type AttentionStatus,
  type AttentionSubjectKind,
} from "@knowget/executive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface AttentionItemRow {
  id: string;
  tenantId: string;
  organizationId: string;
  assessmentId: string;
  indexKey: string;
  period: number;
  key: string;
  reason: string;
  severity: string;
  subjectKind: string;
  subject: string;
  observed: number | null;
  status: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closureNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AttentionItemRow): AttentionItem {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    assessmentId: row.assessmentId as Uuid,
    indexKey: row.indexKey,
    period: row.period,
    key: row.key,
    reason: row.reason as AttentionReason,
    severity: row.severity as AttentionSeverity,
    subjectKind: row.subjectKind as AttentionSubjectKind,
    subject: row.subject,
    observed: row.observed,
    status: row.status as AttentionStatus,
    acknowledgedAt: (row.acknowledgedAt as ISODateString | null) ?? null,
    acknowledgedBy: (row.acknowledgedBy as Uuid | null) ?? null,
    closedAt: (row.closedAt as ISODateString | null) ?? null,
    closedBy: (row.closedBy as Uuid | null) ?? null,
    closureNote: row.closureNote,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(item: AttentionItem) {
  return {
    tenantId: item.tenantId,
    organizationId: item.organizationId,
    assessmentId: item.assessmentId,
    indexKey: item.indexKey,
    period: item.period,
    key: item.key,
    reason: item.reason,
    severity: item.severity,
    subjectKind: item.subjectKind,
    subject: item.subject,
    observed: item.observed,
    status: item.status,
    acknowledgedAt: item.acknowledgedAt,
    acknowledgedBy: item.acknowledgedBy,
    closedAt: item.closedAt,
    closedBy: item.closedBy,
    closureNote: item.closureNote,
  };
}

/**
 * Prisma-backed {@link AttentionItemRepository} (RLS via {@link withTenant}).
 *
 * There is no `remove`, the port declares none, and here that omission is the point rather than a consequence of
 * one. An attention item is a finding somebody would rather not have. The single operation a governance queue
 * must never offer is making an inconvenient finding disappear without a trace, so the only way an item leaves
 * the queue is a recorded judgement — resolved, or dismissed with a reason and the person who signed it.
 */
export class PrismaAttentionItemRepository implements AttentionItemRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AttentionItem | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.attentionItem.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The item's compound identity, and what makes raising the same finding twice an update rather than a
   * duplicate. Closed items are found here too: a finding the same period's arithmetic raises again after
   * somebody dismissed it must land on the dismissal, not beside it, or the queue would fill with the item its
   * owner has already answered.
   */
  findByAssessmentAndKey(
    tenantId: TenantId,
    assessmentId: Uuid,
    key: string,
  ): Promise<AttentionItem | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.attentionItem.findFirst({ where: { assessmentId, key } });
      return row ? toDomain(row) : null;
    });
  }

  listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<AttentionItem[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attentionItem.findMany({
        where: { assessmentId },
        orderBy: { key: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /**
   * The queue an institution works from — open and acknowledged both, because acknowledging a finding is saying
   * somebody has it, not that it is done.
   *
   * Ordering is by period and then by key, deliberately not by severity. Severity is stored as its word, so a
   * database sort would put `advisory` above `critical` and `informational` above `urgent` — the alphabet, wearing
   * the shape of a priority order. The domain's own `severityRank` is what the vocabulary means by rank, and
   * a caller ranking a queue applies it after reading. A sort that looked like a ranking without being one would
   * be believed, which is worse than no order at all.
   */
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<AttentionItem[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attentionItem.findMany({
        where: { organizationId, status: { in: ["open", "acknowledged"] } },
        orderBy: [{ period: "desc" }, { key: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AttentionItem[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.attentionItem.findMany({
        orderBy: [{ indexKey: "asc" }, { period: "asc" }, { key: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(item: AttentionItem): Promise<void> {
    return withTenant(this.db, item.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(item);
      await tx.attentionItem.upsert({
        where: { id: item.id },
        create: { id: item.id, ...fields },
        update: fields,
      });
    });
  }
}
