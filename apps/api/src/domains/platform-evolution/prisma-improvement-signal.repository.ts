import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type EvidenceCitation,
  type ImprovementSignal,
  type ImprovementSignalRepository,
  type SignalAccount,
  type SignalPriority,
  type SignalSource,
  type SignalStatus,
} from "@knowget/platform-evolution";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/** Signal statuses the queue is still holding open — the complement of the domain's terminal set. */
const OPEN_SIGNAL_STATUSES = ["raised", "triaged"];

interface ImprovementSignalRow {
  id: string;
  tenantId: string;
  organizationId: string;
  signalKey: string;
  source: string;
  summary: string;
  status: string;
  priority: string;
  corroboration: number;
  repeatAccounts: number;
  unattributed: number;
  selfEvident: boolean;
  citations: unknown;
  accounts: unknown;
  raisedBy: string | null;
  triagedAt: string | null;
  triagedBy: string | null;
  settledAt: string | null;
  settledBy: string | null;
  mergedIntoSignalId: string | null;
  declineReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ImprovementSignalRow): ImprovementSignal {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    signalKey: row.signalKey,
    source: row.source as SignalSource,
    summary: row.summary,
    status: row.status as SignalStatus,
    priority: row.priority as SignalPriority,
    corroboration: row.corroboration,
    repeatAccounts: row.repeatAccounts,
    unattributed: row.unattributed,
    selfEvident: row.selfEvident,
    citations: (row.citations as EvidenceCitation[]) ?? [],
    accounts: (row.accounts as SignalAccount[]) ?? [],
    raisedBy: (row.raisedBy as Uuid | null) ?? null,
    triagedAt: (row.triagedAt as ISODateString | null) ?? null,
    triagedBy: (row.triagedBy as Uuid | null) ?? null,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    settledBy: (row.settledBy as Uuid | null) ?? null,
    mergedIntoSignalId: (row.mergedIntoSignalId as Uuid | null) ?? null,
    declineReason: row.declineReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(signal: ImprovementSignal) {
  return {
    tenantId: signal.tenantId,
    organizationId: signal.organizationId,
    signalKey: signal.signalKey,
    source: signal.source,
    summary: signal.summary,
    status: signal.status,
    priority: signal.priority,
    corroboration: signal.corroboration,
    repeatAccounts: signal.repeatAccounts,
    unattributed: signal.unattributed,
    selfEvident: signal.selfEvident,
    citations: JSON.parse(JSON.stringify(signal.citations)),
    accounts: JSON.parse(JSON.stringify(signal.accounts)),
    raisedBy: signal.raisedBy,
    triagedAt: signal.triagedAt,
    triagedBy: signal.triagedBy,
    settledAt: signal.settledAt,
    settledBy: signal.settledBy,
    mergedIntoSignalId: signal.mergedIntoSignalId,
    declineReason: signal.declineReason,
  };
}

/**
 * Prisma-backed {@link ImprovementSignalRepository} (RLS via {@link withTenant}).
 *
 * Citations and accounts are JSONB on the signal rather than rows pointing back at it, and both are deliberate.
 * A citation is a claim made at the moment the signal was raised, and one that could be edited independently
 * would let the evidence behind an accepted signal be changed after the acceptance. The accounts are the
 * corroboration itself — the corroboration, repeat-account and unattributed counts are all a function of exactly
 * that list, so storing them apart would create two places the same number could be arrived at differently.
 *
 * There is no `remove`, the port declares none, and here the omission is the point. A signal is the institution
 * being told something it may not want to hear; the one operation an improvement queue must never offer is
 * making an inconvenient observation disappear without a trace. The only exits are recorded ones — accepted,
 * merged into the signal it duplicates, or declined with a reason and the person who signed it.
 */
export class PrismaImprovementSignalRepository implements ImprovementSignalRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ImprovementSignal | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.improvementSignal.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The key lookup behind the one-signal-per-key rule, and it deliberately finds settled signals too. A problem
   * raised again arrives at a key that is already taken, and the declined signal wearing it carries what the
   * institution decided last time — which is the whole of how recurrence is answered here.
   */
  findByKey(tenantId: TenantId, signalKey: string): Promise<ImprovementSignal | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.improvementSignal.findFirst({ where: { signalKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The improvement queue itself — raised and triaged alike, oldest first.
   *
   * Arrival order is the honest sort for a queue whose failure mode is age: the signal that has waited longest
   * for an answer is the one nobody has dealt with, and it is the one an institution claiming to triage what it
   * is told has to be able to see. Priority is deliberately not the sort. It is stored as its word, so a
   * database ordering would put `elevated` above `routine` and `routine` above `urgent` — the alphabet, wearing
   * the shape of a priority order. A sort that looked like a ranking without being one would be believed, and
   * the rank the vocabulary means is the domain's to apply after reading.
   */
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementSignal[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.improvementSignal.findMany({
        where: { organizationId, status: { in: OPEN_SIGNAL_STATUSES } },
        orderBy: [{ createdAt: "asc" }, { signalKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ImprovementSignal[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.improvementSignal.findMany({ orderBy: { signalKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(signal: ImprovementSignal): Promise<void> {
    return withTenant(this.db, signal.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(signal);
      await tx.improvementSignal.upsert({
        where: { id: signal.id },
        create: { id: signal.id, ...fields },
        update: fields,
      });
    });
  }
}
