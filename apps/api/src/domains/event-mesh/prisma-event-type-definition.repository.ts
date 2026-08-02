import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type CompatibilityMode,
  type EventTypeDefinition,
  type EventTypeDefinitionRepository,
  type EventTypeStatus,
  type SchemaField,
} from "@knowget/event-mesh";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface EventTypeDefinitionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  eventTypeKey: string;
  version: number;
  title: string;
  summary: string;
  compatibilityMode: string;
  status: string;
  schemaFields: unknown;
  publishedAt: string | null;
  publishedBy: string | null;
  deprecatedAt: string | null;
  retireAt: string | null;
  supersededByVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EventTypeDefinitionRow): EventTypeDefinition {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    eventTypeKey: row.eventTypeKey,
    version: row.version,
    title: row.title,
    summary: row.summary,
    compatibilityMode: row.compatibilityMode as CompatibilityMode,
    status: row.status as EventTypeStatus,
    schemaFields: (row.schemaFields as SchemaField[]) ?? [],
    publishedAt: (row.publishedAt as ISODateString | null) ?? null,
    publishedBy: (row.publishedBy as Uuid | null) ?? null,
    deprecatedAt: (row.deprecatedAt as ISODateString | null) ?? null,
    retireAt: (row.retireAt as ISODateString | null) ?? null,
    supersededByVersion: row.supersededByVersion,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(definition: EventTypeDefinition) {
  return {
    tenantId: definition.tenantId,
    organizationId: definition.organizationId,
    eventTypeKey: definition.eventTypeKey,
    version: definition.version,
    title: definition.title,
    summary: definition.summary,
    compatibilityMode: definition.compatibilityMode,
    status: definition.status,
    schemaFields: JSON.parse(JSON.stringify(definition.schemaFields)),
    publishedAt: definition.publishedAt,
    publishedBy: definition.publishedBy,
    deprecatedAt: definition.deprecatedAt,
    retireAt: definition.retireAt,
    supersededByVersion: definition.supersededByVersion,
  };
}

/**
 * Prisma-backed {@link EventTypeDefinitionRepository} (RLS via {@link withTenant}).
 *
 * The schema fields are JSONB and they belong there, because a schema is the one column in this table nothing
 * ever queries across. What the mesh asks of a schema is *what shape did version 4 promise* — always about one
 * row, always the whole of it, and always in the compatibility engine's own vocabulary. A normalized field table
 * would buy a query nobody runs at the cost of making the shape of a published version reachable by a partial
 * write, and a published shape is the platform's most load-bearing immutable.
 *
 * `listByKey` is ordered in SQL and it is safe to do so here, unlike most of this domain's reads: a version is
 * an integer, so the database's ordering and the port's `left.version - right.version` are the same ordering
 * under every collation. This is the read a compatibility check walks to find its predecessor, so getting the
 * order from the index rather than from a sort in the API process is worth having.
 *
 * `listCarried` spells out `published` and `deprecated` rather than deriving them from the publishability
 * predicate, and the duplication is deliberate: the pure predicate and this `IN` list are two statements of one
 * rule that have to agree, and the compiler cannot check that they do. A deprecated version belongs in the set
 * because deprecation is a notice period — dropping it would turn every announcement into an immediate
 * cut-off for producers still publishing against it, which is exactly the outage a notice period exists to
 * avoid.
 *
 * The two reads with no documented order get a deterministic `ORDER BY` on key then version, which is the order
 * somebody reading a registry expects and the order a diff between two environments needs.
 *
 * There is no `remove`. A retired definition keeps its row because the messages it shaped keep theirs, and the
 * question *what did version 2 of this event actually contain* is asked most often by whoever is reading a
 * three-year-old message and cannot otherwise tell.
 */
export class PrismaEventTypeDefinitionRepository implements EventTypeDefinitionRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EventTypeDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.eventTypeDefinition.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The identity rule the registry rests on: one key and one version name one definition, permanently. */
  findByKeyAndVersion(
    tenantId: TenantId,
    eventTypeKey: string,
    version: number,
  ): Promise<EventTypeDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.eventTypeDefinition.findFirst({ where: { eventTypeKey, version } });
      return row ? toDomain(row) : null;
    });
  }

  /** One event type's version history, oldest cut first — what a compatibility check reads. */
  listByKey(tenantId: TenantId, eventTypeKey: string): Promise<EventTypeDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventTypeDefinition.findMany({
        where: { eventTypeKey },
        orderBy: { version: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /** What a producer may legitimately publish against right now, drafts and retirements excluded. */
  listCarried(tenantId: TenantId, organizationId: Uuid): Promise<EventTypeDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventTypeDefinition.findMany({
        where: { organizationId, status: { in: ["published", "deprecated"] } },
        orderBy: [{ eventTypeKey: "asc" }, { version: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<EventTypeDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventTypeDefinition.findMany({
        orderBy: [{ eventTypeKey: "asc" }, { version: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(definition: EventTypeDefinition): Promise<void> {
    return withTenant(this.db, definition.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(definition);
      await tx.eventTypeDefinition.upsert({
        where: { id: definition.id },
        create: { id: definition.id, ...fields },
        update: fields,
      });
    });
  }
}
