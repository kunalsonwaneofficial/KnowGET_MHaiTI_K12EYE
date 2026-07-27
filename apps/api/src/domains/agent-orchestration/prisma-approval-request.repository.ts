import {
  type ApprovalDecision,
  type ApprovalRequest,
  type ApprovalRequestRepository,
  type ApprovalSubject,
  type AuthorizationReason,
  type RiskLevel,
} from "@knowget/agent-orchestration";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ApprovalRequestRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subject: string;
  subjectId: string;
  agentId: string;
  capabilityKey: string | null;
  reasons: string[];
  riskLevel: string;
  decision: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  expiresAt: string | null;
  consumedAt: string | null;
  consumedByInvocationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ApprovalRequestRow): ApprovalRequest {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subject: row.subject as ApprovalSubject,
    subjectId: row.subjectId,
    agentId: row.agentId,
    capabilityKey: row.capabilityKey,
    reasons: row.reasons as AuthorizationReason[],
    riskLevel: row.riskLevel as RiskLevel,
    decision: row.decision as ApprovalDecision,
    decidedByUserId: row.decidedByUserId,
    decidedAt: (row.decidedAt as ISODateString | null) ?? null,
    decisionNote: row.decisionNote,
    expiresAt: (row.expiresAt as ISODateString | null) ?? null,
    consumedAt: (row.consumedAt as ISODateString | null) ?? null,
    consumedByInvocationId: row.consumedByInvocationId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(request: ApprovalRequest) {
  return {
    tenantId: request.tenantId,
    organizationId: request.organizationId,
    subject: request.subject,
    subjectId: request.subjectId,
    agentId: request.agentId,
    capabilityKey: request.capabilityKey,
    reasons: [...request.reasons],
    riskLevel: request.riskLevel,
    decision: request.decision,
    decidedByUserId: request.decidedByUserId,
    decidedAt: request.decidedAt,
    decisionNote: request.decisionNote,
    expiresAt: request.expiresAt,
    consumedAt: request.consumedAt,
    consumedByInvocationId: request.consumedByInvocationId,
  };
}

/**
 * Prisma-backed {@link ApprovalRequestRepository} (RLS via {@link withTenant}) — the human gate.
 *
 * There is no `remove` here, and no soft-delete filter either, because there is no delete path above this: a
 * decided request is the record of who allowed what, and a request nobody answered is the record of that too.
 * `findOpenForSubject` is what stops the runtime asking the same question twice — it finds the *pending* request
 * standing in front of a subject, so a second attempt joins the queue rather than duplicating it.
 *
 * `consumedAt`/`consumedByInvocationId` round-trip like any other column and are never cleared once set, which is
 * what makes the gate single-use: the row that granted permission goes on to record that the permission was used up.
 */
export class PrismaApprovalRequestRepository implements ApprovalRequestRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ApprovalRequest | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.approvalRequest.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  findOpenForSubject(
    tenantId: TenantId,
    subject: string,
    subjectId: string,
  ): Promise<ApprovalRequest | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.approvalRequest.findFirst({
        where: { subject, subjectId, decision: "pending" },
      });
      return row ? toDomain(row) : null;
    });
  }

  listBySubject(
    tenantId: TenantId,
    subject: string,
    subjectId: string,
  ): Promise<ApprovalRequest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.approvalRequest.findMany({ where: { subject, subjectId } });
      return rows.map(toDomain);
    });
  }

  listPending(tenantId: TenantId): Promise<ApprovalRequest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.approvalRequest.findMany({ where: { decision: "pending" } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ApprovalRequest[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.approvalRequest.findMany();
      return rows.map(toDomain);
    });
  }

  save(request: ApprovalRequest): Promise<void> {
    return withTenant(this.db, request.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(request);
      await tx.approvalRequest.upsert({
        where: { id: request.id },
        create: { id: request.id, ...fields },
        update: fields,
      });
    });
  }
}
