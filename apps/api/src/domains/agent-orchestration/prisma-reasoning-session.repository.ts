import {
  type ReasoningSession,
  type ReasoningSessionRepository,
  type ReasoningTrace,
  type SessionStatus,
} from "@knowget/agent-orchestration";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface ReasoningSessionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  agentId: string;
  purpose: string;
  status: string;
  traces: unknown;
  executionPlanId: string | null;
  conclusion: string | null;
  concludedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ReasoningSessionRow): ReasoningSession {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    agentId: row.agentId,
    purpose: row.purpose,
    status: row.status as SessionStatus,
    traces: (row.traces as ReasoningTrace[]) ?? [],
    executionPlanId: row.executionPlanId,
    conclusion: row.conclusion,
    concludedAt: (row.concludedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(session: ReasoningSession) {
  return {
    tenantId: session.tenantId,
    organizationId: session.organizationId,
    agentId: session.agentId,
    purpose: session.purpose,
    status: session.status,
    traces: JSON.parse(JSON.stringify(session.traces)),
    executionPlanId: session.executionPlanId,
    conclusion: session.conclusion,
    concludedAt: session.concludedAt,
  };
}

/**
 * Prisma-backed {@link ReasoningSessionRepository} (RLS via {@link withTenant}) — the record of *why*.
 *
 * Traces live in the session's JSONB column for the same reason plan steps live in the plan's: the invariants
 * are between traces, not within one. Evidence may only point at a strictly lower ordinal, and that is a claim
 * about the whole chain — a trace row that could be written alone could be written pointing forwards.
 *
 * There is no `remove` and no soft-delete filter. A conclusion an institution acted on and the steps that led
 * to it are the same object; being able to drop the second while keeping the first would leave the platform
 * asserting things it could no longer explain.
 */
export class PrismaReasoningSessionRepository implements ReasoningSessionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ReasoningSession | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.reasoningSession.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  listByAgent(tenantId: TenantId, agentId: string): Promise<ReasoningSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.reasoningSession.findMany({ where: { agentId } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ReasoningSession[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.reasoningSession.findMany();
      return rows.map(toDomain);
    });
  }

  save(session: ReasoningSession): Promise<void> {
    return withTenant(this.db, session.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(session);
      await tx.reasoningSession.upsert({
        where: { id: session.id },
        create: { id: session.id, ...fields },
        update: fields,
      });
    });
  }
}
