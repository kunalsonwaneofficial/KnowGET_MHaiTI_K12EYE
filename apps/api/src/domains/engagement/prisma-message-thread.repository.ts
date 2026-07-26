import type { MessageThread, MessageThreadRepository, ThreadStatus } from "@knowget/engagement";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface MessageThreadRow {
  id: string;
  tenantId: string;
  organizationId: string;
  subject: string;
  participantPersonIds: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: MessageThreadRow): MessageThread {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    subject: row.subject,
    participantPersonIds: (row.participantPersonIds as Uuid[] | null) ?? [],
    status: row.status as ThreadStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(thread: MessageThread) {
  return {
    tenantId: thread.tenantId,
    organizationId: thread.organizationId,
    subject: thread.subject,
    // Serialize to a plain JSON value for the JSONB column.
    participantPersonIds: JSON.parse(JSON.stringify(thread.participantPersonIds)),
    status: thread.status,
  };
}

/** Prisma-backed {@link MessageThreadRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaMessageThreadRepository implements MessageThreadRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<MessageThread | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.messageThread.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByParticipant(tenantId: TenantId, personId: Uuid): Promise<MessageThread[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.messageThread.findMany({
        where: { participantPersonIds: { array_contains: personId }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<MessageThread[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.messageThread.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<MessageThread[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.messageThread.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(thread: MessageThread): Promise<void> {
    return withTenant(this.db, thread.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(thread);
      await tx.messageThread.upsert({
        where: { id: thread.id },
        create: { id: thread.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.messageThread.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
