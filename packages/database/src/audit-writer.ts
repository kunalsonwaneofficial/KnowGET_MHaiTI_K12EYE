import type { Prisma } from "@prisma/client";
import type { PrismaService } from "./prisma-service";
import type { TransactionClient } from "./transaction-manager";

/** A platform audit entry to persist. */
export interface AuditEntry {
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string;
  readonly tenantId?: string;
  readonly actorId?: string;
  readonly correlationId?: string;
  readonly data?: Record<string, unknown>;
}

/**
 * Writes platform audit entries to the audit log. Accepts an optional
 * transaction client so audit records commit atomically with the operation they
 * describe.
 */
export class AuditWriter {
  constructor(private readonly service: PrismaService) {}

  async write(entry: AuditEntry, tx?: TransactionClient): Promise<void> {
    const client = tx ?? this.service.client;
    await client.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        correlationId: entry.correlationId,
        ...(entry.data ? { data: entry.data as Prisma.InputJsonValue } : {}),
      },
    });
  }
}
