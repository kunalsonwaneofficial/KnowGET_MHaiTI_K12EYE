import {
  type AgentDefinition,
  type AgentRepository,
  type AgentStatus,
  type AutonomyLevel,
} from "@knowget/agent-orchestration";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AgentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  key: string;
  name: string;
  purpose: string | null;
  autonomyLevel: string;
  status: string;
  grantedCapabilityKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AgentRow): AgentDefinition {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    key: row.key,
    name: row.name,
    purpose: row.purpose,
    autonomyLevel: row.autonomyLevel as AutonomyLevel,
    status: row.status as AgentStatus,
    grantedCapabilityKeys: row.grantedCapabilityKeys,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(agent: AgentDefinition) {
  return {
    tenantId: agent.tenantId,
    organizationId: agent.organizationId,
    key: agent.key,
    name: agent.name,
    purpose: agent.purpose,
    autonomyLevel: agent.autonomyLevel,
    status: agent.status,
    grantedCapabilityKeys: [...agent.grantedCapabilityKeys],
  };
}

/**
 * Prisma-backed {@link AgentRepository} (RLS via {@link withTenant}). The grant set is written as the whole
 * array every time rather than as a diff: an agent's reach is one value, and a partially-applied reach is a
 * security bug rather than a stale read.
 */
export class PrismaAgentRepository implements AgentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AgentDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.agentDefinition.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, key: string): Promise<AgentDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.agentDefinition.findFirst({ where: { key, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByTenant(tenantId: TenantId): Promise<AgentDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.agentDefinition.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(agent: AgentDefinition): Promise<void> {
    return withTenant(this.db, agent.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(agent);
      await tx.agentDefinition.upsert({
        where: { id: agent.id },
        create: { id: agent.id, ...fields },
        update: fields,
      });
    });
  }

  /** Soft-delete. */
  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.agentDefinition.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
