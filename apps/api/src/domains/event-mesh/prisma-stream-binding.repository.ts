import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type BindingStatus,
  type StreamBinding,
  type StreamBindingRepository,
  type TransportKind,
} from "@knowget/event-mesh";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface StreamBindingRow {
  id: string;
  tenantId: string;
  organizationId: string;
  streamKey: string;
  transport: string;
  transportRef: string;
  status: string;
  activatedAt: string | null;
  activatedBy: string | null;
  drainingSince: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: StreamBindingRow): StreamBinding {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    streamKey: row.streamKey,
    transport: row.transport as TransportKind,
    transportRef: row.transportRef,
    status: row.status as BindingStatus,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    activatedBy: (row.activatedBy as Uuid | null) ?? null,
    drainingSince: (row.drainingSince as ISODateString | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(binding: StreamBinding) {
  return {
    tenantId: binding.tenantId,
    organizationId: binding.organizationId,
    streamKey: binding.streamKey,
    transport: binding.transport,
    transportRef: binding.transportRef,
    status: binding.status,
    activatedAt: binding.activatedAt,
    activatedBy: binding.activatedBy,
    drainingSince: binding.drainingSince,
    retiredAt: binding.retiredAt,
  };
}

/**
 * Prisma-backed {@link StreamBindingRepository} (RLS via {@link withTenant}).
 *
 * `transportRef` is stored as the handle the package refuses to let be anything else — `config:mesh.kafka.primary`
 * and never a connection string. Nothing here re-checks that, because the value object already did and doing it
 * twice would put a second, weaker opinion about what a secret looks like into the composition root. What this
 * layer contributes is that the column carries no more than the domain allowed in.
 *
 * `listByStream` orders on `created_at`, which is a real `timestamptz` rather than one of this domain's stored
 * ISO strings, so the database's ordering and the port's `compareText` on the rendered instant are the same
 * ordering — a fixed-width ISO rendering is monotonic in the instant it renders. That is the read an operator
 * watches a transport migration through, and the order it wants is the order the bindings were declared in:
 * the outbox binding that has carried the stream for a year, then the broker binding that arrived this morning.
 *
 * `listCarrying` spells out `active`, and the exclusion that matters is `draining`. A draining binding is still
 * delivering what it already accepted, so it is tempting to count it as carrying — but the two states are
 * different facts about the estate and the operator needs them apart. A binding that is carrying is a
 * dependency; a binding that is draining is a countdown, and a list that merges them is a list where nothing
 * ever finishes migrating.
 *
 * `findByStreamAndTransport` uses `findFirst` over the pair rather than the compound unique. The uniqueness is
 * real and the migration enforces it, but reading through `findFirst` keeps every lookup in this domain the
 * same shape — including the three whose uniqueness is a partial index Prisma cannot express as a key at all.
 */
export class PrismaStreamBindingRepository implements StreamBindingRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<StreamBinding | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.streamBinding.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** One stream is bound to one backbone once, which is the guard this read exists to serve. */
  findByStreamAndTransport(
    tenantId: TenantId,
    streamKey: string,
    transport: TransportKind,
  ): Promise<StreamBinding | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.streamBinding.findFirst({ where: { streamKey, transport } });
      return row ? toDomain(row) : null;
    });
  }

  /** Everything attached to one stream, declaration order — how a migration is run and proved finished. */
  listByStream(tenantId: TenantId, streamKey: string): Promise<StreamBinding[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.streamBinding.findMany({
        where: { streamKey },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /** The backbones actually moving traffic for one institution right now, draining ones excluded. */
  listCarrying(tenantId: TenantId, organizationId: Uuid): Promise<StreamBinding[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.streamBinding.findMany({
        where: { organizationId, status: "active" },
        orderBy: [{ streamKey: "asc" }, { transport: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<StreamBinding[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.streamBinding.findMany({
        orderBy: [{ streamKey: "asc" }, { transport: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(binding: StreamBinding): Promise<void> {
    return withTenant(this.db, binding.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(binding);
      await tx.streamBinding.upsert({
        where: { id: binding.id },
        create: { id: binding.id, ...fields },
        update: fields,
      });
    });
  }
}
