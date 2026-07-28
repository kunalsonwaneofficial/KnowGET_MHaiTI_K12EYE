import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type AttentionSignal,
  type BriefingStatus,
  type ExecutiveBriefing,
  type ExecutiveBriefingRepository,
  type RecordedIndex,
} from "@knowget/executive-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ExecutiveBriefingRow {
  id: string;
  tenantId: string;
  organizationId: string;
  briefingKey: string;
  title: string;
  narrative: string | null;
  audienceScope: string;
  assessmentId: string;
  indexKey: string;
  period: number;
  cited: unknown;
  findings: unknown;
  status: string;
  issuedAt: string | null;
  withdrawnAt: string | null;
  withdrawalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ExecutiveBriefingRow): ExecutiveBriefing {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    briefingKey: row.briefingKey,
    title: row.title,
    narrative: row.narrative,
    audienceScope: row.audienceScope,
    assessmentId: row.assessmentId as Uuid,
    indexKey: row.indexKey,
    period: row.period,
    cited: row.cited as RecordedIndex,
    findings: (row.findings as AttentionSignal[]) ?? [],
    status: row.status as BriefingStatus,
    issuedAt: (row.issuedAt as ISODateString | null) ?? null,
    withdrawnAt: (row.withdrawnAt as ISODateString | null) ?? null,
    withdrawalReason: row.withdrawalReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(briefing: ExecutiveBriefing) {
  return {
    tenantId: briefing.tenantId,
    organizationId: briefing.organizationId,
    briefingKey: briefing.briefingKey,
    title: briefing.title,
    narrative: briefing.narrative,
    audienceScope: briefing.audienceScope,
    assessmentId: briefing.assessmentId,
    indexKey: briefing.indexKey,
    period: briefing.period,
    cited: JSON.parse(JSON.stringify(briefing.cited)),
    findings: JSON.parse(JSON.stringify(briefing.findings)),
    status: briefing.status,
    issuedAt: briefing.issuedAt,
    withdrawnAt: briefing.withdrawnAt,
    withdrawalReason: briefing.withdrawalReason,
  };
}

/**
 * Prisma-backed {@link ExecutiveBriefingRepository} (RLS via {@link withTenant}).
 *
 * The cited figure and the findings are copied into JSONB rather than joined from the assessment, which is the
 * one thing about this table worth understanding. A briefing is a document an institution stood behind on a
 * date. Reading its numbers back through a live join would mean a board pack silently restating itself when the
 * assessment behind it was later invalidated — the minute would keep saying "as reported to the board" while
 * showing a figure the board never saw. So the figure is pinned, and `assessmentId` records which arithmetic it
 * came from without making the document depend on that arithmetic still standing.
 *
 * There is no `remove`, and the port declares none. A briefing the institution no longer stands behind is
 * withdrawn with a reason, because the minute that cites it still has to resolve — to the document, and to the
 * fact that it was withdrawn.
 */
export class PrismaExecutiveBriefingRepository implements ExecutiveBriefingRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ExecutiveBriefing | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.executiveBriefing.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, briefingKey: string): Promise<ExecutiveBriefing | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.executiveBriefing.findFirst({ where: { briefingKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * What this organization node currently stands behind, most recent period first. Drafts and withdrawals are
   * both left out, for different reasons that happen to agree: a draft was never issued, and a withdrawal was
   * issued and taken back. Neither is something a reader should find by browsing.
   */
  listIssued(tenantId: TenantId, organizationId: Uuid): Promise<ExecutiveBriefing[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.executiveBriefing.findMany({
        where: { organizationId, status: "issued" },
        orderBy: [{ period: "desc" }, { briefingKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  /**
   * Every briefing drawn from one assessment, whatever became of it. Withdrawn documents are included here on
   * purpose: this is the read that answers "what did we tell people about this figure", and a withdrawal is part
   * of that answer rather than an erasure of it.
   */
  listByAssessment(tenantId: TenantId, assessmentId: Uuid): Promise<ExecutiveBriefing[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.executiveBriefing.findMany({
        where: { assessmentId },
        orderBy: { briefingKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ExecutiveBriefing[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.executiveBriefing.findMany({ orderBy: { briefingKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(briefing: ExecutiveBriefing): Promise<void> {
    return withTenant(this.db, briefing.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(briefing);
      await tx.executiveBriefing.upsert({
        where: { id: briefing.id },
        create: { id: briefing.id, ...fields },
        update: fields,
      });
    });
  }
}
