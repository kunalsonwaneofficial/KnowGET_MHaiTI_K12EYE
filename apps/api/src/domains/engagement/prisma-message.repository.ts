import type { Message, MessageRepository } from "@knowget/engagement";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface MessageRow {
  id: string;
  tenantId: string;
  organizationId: string;
  threadId: string;
  authorPersonId: string;
  body: string;
  sentAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: MessageRow): Message {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    threadId: row.threadId as Uuid,
    authorPersonId: row.authorPersonId as Uuid,
    body: row.body,
    sentAt: row.sentAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(message: Message) {
  return {
    tenantId: message.tenantId,
    organizationId: message.organizationId,
    threadId: message.threadId,
    authorPersonId: message.authorPersonId,
    body: message.body,
    sentAt: message.sentAt,
  };
}

/**
 * Prisma-backed {@link MessageRepository} (RLS via {@link withTenant}). Messages are immutable and
 * append-only, so there is no `remove`.
 */
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Message | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.message.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByThread(tenantId: TenantId, threadId: Uuid): Promise<Message[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.message.findMany({ where: { threadId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  countByThread(tenantId: TenantId, threadId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.message.count({ where: { threadId, deletedAt: null } });
    });
  }

  listByTenant(tenantId: TenantId): Promise<Message[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.message.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(message: Message): Promise<void> {
    return withTenant(this.db, message.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(message);
      await tx.message.upsert({
        where: { id: message.id },
        create: { id: message.id, ...fields },
        update: fields,
      });
    });
  }
}
