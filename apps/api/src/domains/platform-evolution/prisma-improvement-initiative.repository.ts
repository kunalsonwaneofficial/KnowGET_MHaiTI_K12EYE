import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ChangeClass,
  type ImprovementInitiative,
  type ImprovementInitiativeRepository,
  type InitiativeStatus,
} from "@knowget/platform-evolution";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

/** Initiative statuses still going somewhere — the complement of the domain's terminal set. */
const OPEN_INITIATIVE_STATUSES = ["draft", "submitted", "under_review", "approved", "piloting"];

/** The one status an adoption review may be drawn from. */
const ADOPTED_STATUS = "adopted";

interface ImprovementInitiativeRow {
  id: string;
  tenantId: string;
  organizationId: string;
  initiativeKey: string;
  changeClass: string;
  summary: string;
  originatingSignalIds: unknown;
  status: string;
  proposedBy: string;
  submittedAt: string | null;
  reviewStartedAt: string | null;
  approvedAt: string | null;
  pilotStartedAt: string | null;
  pilotStartedPeriod: number | null;
  settledAt: string | null;
  settledBy: string | null;
  withdrawalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ImprovementInitiativeRow): ImprovementInitiative {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    initiativeKey: row.initiativeKey,
    changeClass: row.changeClass as ChangeClass,
    summary: row.summary,
    originatingSignalIds: (row.originatingSignalIds as Uuid[]) ?? [],
    status: row.status as InitiativeStatus,
    proposedBy: row.proposedBy as Uuid,
    submittedAt: (row.submittedAt as ISODateString | null) ?? null,
    reviewStartedAt: (row.reviewStartedAt as ISODateString | null) ?? null,
    approvedAt: (row.approvedAt as ISODateString | null) ?? null,
    pilotStartedAt: (row.pilotStartedAt as ISODateString | null) ?? null,
    pilotStartedPeriod: row.pilotStartedPeriod,
    settledAt: (row.settledAt as ISODateString | null) ?? null,
    settledBy: (row.settledBy as Uuid | null) ?? null,
    withdrawalReason: row.withdrawalReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(initiative: ImprovementInitiative) {
  return {
    tenantId: initiative.tenantId,
    organizationId: initiative.organizationId,
    initiativeKey: initiative.initiativeKey,
    changeClass: initiative.changeClass,
    summary: initiative.summary,
    originatingSignalIds: JSON.parse(JSON.stringify(initiative.originatingSignalIds)),
    status: initiative.status,
    proposedBy: initiative.proposedBy,
    submittedAt: initiative.submittedAt,
    reviewStartedAt: initiative.reviewStartedAt,
    approvedAt: initiative.approvedAt,
    pilotStartedAt: initiative.pilotStartedAt,
    pilotStartedPeriod: initiative.pilotStartedPeriod,
    settledAt: initiative.settledAt,
    settledBy: initiative.settledBy,
    withdrawalReason: initiative.withdrawalReason,
  };
}

/**
 * Prisma-backed {@link ImprovementInitiativeRepository} (RLS via {@link withTenant}).
 *
 * The originating signals are a JSONB array rather than a join table because they are a fixed, ordered, bounded
 * claim made once at proposal time and never amended: *this is what we say we are answering*. A join table
 * would invite the set to be edited afterwards, and an initiative whose stated provenance could be adjusted
 * after a gate approved it would make the lineage report — which exists to say when a change traces to nothing
 * anybody filed — a statement about the present rather than about the proposal.
 *
 * There is no `remove` and the port declares none. An initiative is rejected or withdrawn, and both are
 * decisions the institution made and later has to be able to account for. The changes an institution decided
 * *not* to make are a substantial part of what its improvement record is worth.
 */
export class PrismaImprovementInitiativeRepository implements ImprovementInitiativeRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ImprovementInitiative | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.improvementInitiative.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, initiativeKey: string): Promise<ImprovementInitiative | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.improvementInitiative.findFirst({ where: { initiativeKey } });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * What is in flight — drafts, submissions, reviews and pilots, oldest first.
   *
   * Arrival order rather than status order, for the failure this read exists to catch: an initiative sitting in
   * `submitted` for a year because whoever would have chased it left. Sorting by status would group that one
   * with every other submission and hide exactly the thing that is wrong with it, while age puts it at the top
   * where somebody has to answer for it.
   */
  listOpen(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementInitiative[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.improvementInitiative.findMany({
        where: { organizationId, status: { in: OPEN_INITIATIVE_STATUSES } },
        orderBy: [{ createdAt: "asc" }, { initiativeKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  /**
   * What the institution actually changed — the worklist an adoption review is drawn from, oldest adoption
   * first. The ordering is the point of the read: a change adopted three years ago and never looked at again is
   * the ordinary fate of institutional improvement, and putting it above this quarter's adoptions is what makes
   * that fate visible to whoever runs the reviews.
   */
  listAdopted(tenantId: TenantId, organizationId: Uuid): Promise<ImprovementInitiative[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.improvementInitiative.findMany({
        where: { organizationId, status: ADOPTED_STATUS },
        orderBy: [{ settledAt: "asc" }, { initiativeKey: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ImprovementInitiative[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.improvementInitiative.findMany({ orderBy: { initiativeKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(initiative: ImprovementInitiative): Promise<void> {
    return withTenant(this.db, initiative.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(initiative);
      await tx.improvementInitiative.upsert({
        where: { id: initiative.id },
        create: { id: initiative.id, ...fields },
        update: fields,
      });
    });
  }
}
