import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type SubscriptionCheckpoint,
  type SubscriptionCheckpointRepository,
} from "@knowget/event-mesh";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface SubscriptionCheckpointRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subscriptionId: string;
  subscriptionKey: string;
  streamKey: string;
  partition: number;
  committedPosition: number;
  positionMovedAt: string;
  resetAt: string | null;
  resetBy: string | null;
  resetReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: SubscriptionCheckpointRow): SubscriptionCheckpoint {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subscriptionId: row.subscriptionId as Uuid,
    subscriptionKey: row.subscriptionKey,
    streamKey: row.streamKey,
    partition: row.partition,
    committedPosition: row.committedPosition,
    positionMovedAt: row.positionMovedAt as ISODateString,
    resetAt: (row.resetAt as ISODateString | null) ?? null,
    resetBy: (row.resetBy as Uuid | null) ?? null,
    resetReason: row.resetReason,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(checkpoint: SubscriptionCheckpoint) {
  return {
    tenantId: checkpoint.tenantId,
    organizationId: checkpoint.organizationId,
    subscriptionId: checkpoint.subscriptionId,
    subscriptionKey: checkpoint.subscriptionKey,
    streamKey: checkpoint.streamKey,
    partition: checkpoint.partition,
    committedPosition: checkpoint.committedPosition,
    positionMovedAt: checkpoint.positionMovedAt,
    resetAt: checkpoint.resetAt,
    resetBy: checkpoint.resetBy,
    resetReason: checkpoint.resetReason,
  };
}

/**
 * Prisma-backed {@link SubscriptionCheckpointRepository} (RLS via {@link withTenant}).
 *
 * The uniqueness this table exists to hold is one position per subscription per partition, and the migration
 * carries it as a named unique index rather than leaving it to the code above. That is not belt and braces. The
 * failure mode of a duplicate here is not a row somebody notices in a list: it is two positions on one partition,
 * a commit landing on whichever of them was read first, and a consumer that appears to advance while quietly
 * reprocessing everything that falls between the two. Nothing downstream reports that — the consumer is running,
 * the lag looks plausible, and the duplicated work shows up as a projection that disagrees with its own source.
 *
 * `listBySubscription` orders on `partition`, which is an integer, so the database's ordering and the port's
 * `left.partition - right.partition` are the same ordering under every collation — unlike the key-ordered reads
 * elsewhere in this domain, which have to be sorted in this process because a key's punctuation is weighted
 * differently by different collations. Per-partition is also the only honest shape for a lag report: a
 * subscription summarised to one number is a subscription whose one dead partition is averaged away by seven
 * healthy ones, and the seven are what somebody looks at before deciding nothing is wrong.
 *
 * `positionMovedAt` is stored exactly as the aggregate rendered it. It is read and reported but never compared
 * with an inequality here, so the fixed-width normalization the message and dead-letter adapters apply would buy
 * nothing at this table — an obligation that arrives with the first range filter somebody adds to it.
 *
 * There is no `remove`. A checkpoint that could be deleted is a consumer that can be silently rewound to the
 * beginning of a stream, which on a `full`-retention stream means re-delivering a month of history to a consumer
 * that has already acted on all of it. Resetting a position is an operation with a reason, an actor and a record;
 * that is `reset`, and it is the only way a position moves backwards.
 */
export class PrismaSubscriptionCheckpointRepository implements SubscriptionCheckpointRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<SubscriptionCheckpoint | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.subscriptionCheckpoint.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** One consumer holds one position on one partition, which is the rule this read exists to enforce. */
  findByPartition(
    tenantId: TenantId,
    subscriptionId: Uuid,
    partition: number,
  ): Promise<SubscriptionCheckpoint | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.subscriptionCheckpoint.findFirst({
        where: { subscriptionId, partition },
      });
      return row ? toDomain(row) : null;
    });
  }

  /** Every position one consumer holds, partition order — the only shape a lag report can honestly take. */
  listBySubscription(tenantId: TenantId, subscriptionId: Uuid): Promise<SubscriptionCheckpoint[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.subscriptionCheckpoint.findMany({
        where: { subscriptionId },
        orderBy: { partition: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<SubscriptionCheckpoint[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.subscriptionCheckpoint.findMany({
        orderBy: [{ subscriptionKey: "asc" }, { partition: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(checkpoint: SubscriptionCheckpoint): Promise<void> {
    return withTenant(this.db, checkpoint.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(checkpoint);
      await tx.subscriptionCheckpoint.upsert({
        where: { id: checkpoint.id },
        create: { id: checkpoint.id, ...fields },
        update: fields,
      });
    });
  }
}
