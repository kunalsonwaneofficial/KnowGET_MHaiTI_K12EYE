import {
  type Reversibility,
  type RiskLevel,
  type ToolDefinition,
  type ToolEffect,
  type ToolRepository,
  type ToolStatus,
} from "@knowget/agent-orchestration";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface ToolRow {
  id: string;
  tenantId: string;
  organizationId: string;
  key: string;
  name: string;
  description: string | null;
  capabilityDomain: string;
  effect: string;
  riskLevel: string;
  reversibility: string;
  compensationKey: string | null;
  requiresApproval: boolean;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ToolRow): ToolDefinition {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    key: row.key,
    name: row.name,
    description: row.description,
    capabilityDomain: row.capabilityDomain,
    effect: row.effect as ToolEffect,
    riskLevel: row.riskLevel as RiskLevel,
    reversibility: row.reversibility as Reversibility,
    compensationKey: row.compensationKey,
    requiresApproval: row.requiresApproval,
    status: row.status as ToolStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(tool: ToolDefinition) {
  return {
    tenantId: tool.tenantId,
    organizationId: tool.organizationId,
    key: tool.key,
    name: tool.name,
    description: tool.description,
    capabilityDomain: tool.capabilityDomain,
    effect: tool.effect,
    riskLevel: tool.riskLevel,
    reversibility: tool.reversibility,
    compensationKey: tool.compensationKey,
    requiresApproval: tool.requiresApproval,
    status: tool.status,
  };
}

/**
 * Prisma-backed {@link ToolRepository} (RLS via {@link withTenant}) — the capability catalog. `findManyByKeys`
 * is a single `IN` read rather than one round trip per step, because plan inspection reads the whole catalog a
 * plan names at once and an inspection that fans out per step gets slower exactly as plans get more interesting.
 */
export class PrismaToolRepository implements ToolRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<ToolDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.toolDefinition.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, key: string): Promise<ToolDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.toolDefinition.findFirst({ where: { key, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findManyByKeys(tenantId: TenantId, keys: readonly string[]): Promise<ToolDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.toolDefinition.findMany({
        where: { key: { in: [...keys] }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<ToolDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.toolDefinition.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(tool: ToolDefinition): Promise<void> {
    return withTenant(this.db, tool.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(tool);
      await tx.toolDefinition.upsert({
        where: { id: tool.id },
        create: { id: tool.id, ...fields },
        update: fields,
      });
    });
  }

  /** Soft-delete; `updateMany` so removing a row this tenant cannot see is a no-op rather than an error. */
  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.toolDefinition.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });
  }
}
