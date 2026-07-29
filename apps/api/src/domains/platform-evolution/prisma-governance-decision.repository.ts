import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ChangeClass,
  type DecisionBallot,
  type GateOutcome,
  type GovernanceDecision,
  type GovernanceDecisionRepository,
  type GovernanceGate,
} from "@knowget/platform-evolution";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/** The one outcome a gate wears while it is still waiting for people. */
const PENDING_OUTCOME = "pending";

interface GovernanceDecisionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  initiativeId: string;
  gate: string;
  changeClass: string;
  proposedBy: string;
  outcome: string;
  required: number;
  affirmed: number;
  outstanding: number;
  conditional: number;
  refused: boolean;
  deferrals: number;
  ballots: unknown;
  convokedAt: string;
  convokedBy: string | null;
  settledAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: GovernanceDecisionRow): GovernanceDecision {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    initiativeId: row.initiativeId as Uuid,
    gate: row.gate as GovernanceGate,
    changeClass: row.changeClass as ChangeClass,
    proposedBy: row.proposedBy as Uuid,
    outcome: row.outcome as GateOutcome,
    required: row.required,
    affirmed: row.affirmed,
    outstanding: row.outstanding,
    conditional: row.conditional,
    refused: row.refused,
    deferrals: row.deferrals,
    ballots: (row.ballots as DecisionBallot[]) ?? [],
    convokedAt: row.convokedAt as ISODateString,
    convokedBy: (row.convokedBy as Uuid | null) ?? null,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(decision: GovernanceDecision) {
  return {
    tenantId: decision.tenantId,
    organizationId: decision.organizationId,
    initiativeId: decision.initiativeId,
    gate: decision.gate,
    changeClass: decision.changeClass,
    proposedBy: decision.proposedBy,
    outcome: decision.outcome,
    required: decision.required,
    affirmed: decision.affirmed,
    outstanding: decision.outstanding,
    conditional: decision.conditional,
    refused: decision.refused,
    deferrals: decision.deferrals,
    ballots: JSON.parse(JSON.stringify(decision.ballots)),
    convokedAt: decision.convokedAt,
    convokedBy: decision.convokedBy,
    settledAt: decision.settledAt,
  };
}

/**
 * Prisma-backed {@link GovernanceDecisionRepository} (RLS via {@link withTenant}).
 *
 * This is the table the contract's second rule lives in — evolution always requires human governance — and the
 * ballots are JSONB on the gate rather than rows beside it for the reason that makes the rule enforceable. The
 * counts are a function of exactly that list: how many distinct people affirmed, how many are outstanding, how
 * many attached conditions, whether anybody refused. Ballots stored independently could be inserted, amended or
 * removed without the counts moving, and a gate whose tally disagreed with its ballots would still read as a
 * decision. Kept together, the tally cannot drift from the people who cast it.
 *
 * Only one gate of a kind may stand open against a subject at a time, and that is enforced by a partial unique
 * index on `(tenant_id, initiative_id, gate) WHERE outcome = 'pending'` rather than by anything here. It is a
 * database constraint because it is the constraint a race would defeat: two concurrent convocations that each
 * checked first and inserted second would produce exactly the duplicate gate the rule exists to prevent, and no
 * amount of checking in application code closes that window.
 *
 * There is no `remove`, and a refused gate is the last thing an institution should be able to make disappear.
 */
export class PrismaGovernanceDecisionRepository implements GovernanceDecisionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<GovernanceDecision | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governanceDecision.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The gate still waiting on people, if there is one. Asked by kind as well as by subject because the kinds
   * are independent questions: an approval gate and a later reversion gate on the same change are both
   * legitimate, and only a second gate of the *same* kind while the first is pending is the move being refused
   * — which is how a gate that went the wrong way is stopped from being quietly retried alongside a fresh one
   * until the answer comes out differently.
   */
  findOpenGate(
    tenantId: TenantId,
    initiativeId: Uuid,
    gate: GovernanceGate,
  ): Promise<GovernanceDecision | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.governanceDecision.findFirst({
        where: { initiativeId, gate, outcome: PENDING_OUTCOME },
      });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The decision trail — every gate ever convened on one subject, in the order it happened.
   *
   * Convocation order is part of the contract rather than a presentation choice: this sequence is the answer to
   * *how was this decided*, and it has to include the refusals, because a change that passed on its third
   * attempt is a different fact about an institution from one that passed on its first.
   */
  listByInitiative(tenantId: TenantId, initiativeId: Uuid): Promise<GovernanceDecision[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceDecision.findMany({
        where: { initiativeId },
        orderBy: { convokedAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<GovernanceDecision[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.governanceDecision.findMany({
        orderBy: [{ initiativeId: "asc" }, { convokedAt: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(decision: GovernanceDecision): Promise<void> {
    return withTenant(this.db, decision.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(decision);
      await tx.governanceDecision.upsert({
        where: { id: decision.id },
        create: { id: decision.id, ...fields },
        update: fields,
      });
    });
  }
}
