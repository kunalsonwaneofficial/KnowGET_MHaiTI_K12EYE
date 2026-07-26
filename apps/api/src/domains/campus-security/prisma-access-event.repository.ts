import type {
  AccessDecision,
  AccessDecisionReason,
  AccessEvent,
  AccessEventRepository,
} from "@knowget/campus-security";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AccessEventRow {
  id: string;
  tenantId: string;
  organizationId: string;
  credentialId: string;
  zoneId: string;
  pointLabel: string | null;
  decision: string;
  reason: string;
  occurredAt: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AccessEventRow): AccessEvent {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    credentialId: row.credentialId as Uuid,
    zoneId: row.zoneId as Uuid,
    pointLabel: row.pointLabel,
    decision: row.decision as AccessDecision,
    reason: row.reason as AccessDecisionReason,
    occurredAt: row.occurredAt,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(event: AccessEvent) {
  return {
    tenantId: event.tenantId,
    organizationId: event.organizationId,
    credentialId: event.credentialId,
    zoneId: event.zoneId,
    pointLabel: event.pointLabel,
    decision: event.decision,
    reason: event.reason,
    occurredAt: event.occurredAt,
  };
}

/**
 * Prisma-backed {@link AccessEventRepository} (RLS via {@link withTenant}). The door log is immutable and
 * append-only, so there is no `remove`.
 */
export class PrismaAccessEventRepository implements AccessEventRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AccessEvent | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.accessEvent.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByCredential(tenantId: TenantId, credentialId: Uuid): Promise<AccessEvent[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessEvent.findMany({ where: { credentialId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByZone(tenantId: TenantId, zoneId: Uuid): Promise<AccessEvent[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessEvent.findMany({ where: { zoneId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AccessEvent[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.accessEvent.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(event: AccessEvent): Promise<void> {
    return withTenant(this.db, event.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(event);
      await tx.accessEvent.upsert({
        where: { id: event.id },
        create: { id: event.id, ...fields },
        update: fields,
      });
    });
  }
}
