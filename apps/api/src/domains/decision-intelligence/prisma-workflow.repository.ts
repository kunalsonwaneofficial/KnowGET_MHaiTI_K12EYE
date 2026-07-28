import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type WorkflowDefinition,
  type WorkflowRepository,
  type WorkflowStage,
  type WorkflowStatus,
  type WorkflowTrigger,
} from "@knowget/decision-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface WorkflowDefinitionRow {
  id: string;
  tenantId: string;
  organizationId: string;
  key: string;
  version: number;
  name: string;
  description: string | null;
  trigger: string;
  triggerSignalKey: string | null;
  status: string;
  stages: unknown;
  publishedAt: string | null;
  publishedByUserId: string | null;
  retiredAt: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: WorkflowDefinitionRow): WorkflowDefinition {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    key: row.key,
    version: row.version,
    name: row.name,
    description: row.description,
    trigger: row.trigger as WorkflowTrigger,
    triggerSignalKey: row.triggerSignalKey,
    status: row.status as WorkflowStatus,
    stages: (row.stages as WorkflowStage[]) ?? [],
    publishedAt: (row.publishedAt as ISODateString | null) ?? null,
    publishedByUserId: row.publishedByUserId,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdByUserId: row.createdByUserId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(workflow: WorkflowDefinition) {
  return {
    tenantId: workflow.tenantId,
    organizationId: workflow.organizationId,
    key: workflow.key,
    version: workflow.version,
    name: workflow.name,
    description: workflow.description,
    trigger: workflow.trigger,
    triggerSignalKey: workflow.triggerSignalKey,
    status: workflow.status,
    stages: JSON.parse(JSON.stringify(workflow.stages)),
    publishedAt: workflow.publishedAt,
    publishedByUserId: workflow.publishedByUserId,
    retiredAt: workflow.retiredAt,
    createdByUserId: workflow.createdByUserId,
  };
}

/**
 * Prisma-backed {@link WorkflowRepository} (RLS via {@link withTenant}).
 *
 * A key does not identify a workflow here — a key and a version do — so there are three ways in and each
 * answers a different question. `findPublishedByKey` is what the runtime asks when a rule or a signal names a
 * process: which version may take new cases right now. `findLatestByKey` is what the editor asks: which
 * version a revision would come from, which is why it orders on version rather than on a timestamp — versions
 * are the sequence, and a clock only agrees with them by coincidence. `findByKeyAndVersion` is what the unique
 * index backs.
 *
 * Stages live in the definition's own JSONB column and are loaded and saved with it. The invariants worth
 * having in a workflow are invariants *across* stages — a dependency graph with no cycles, dependencies that
 * name stages that exist, a compensating capability wherever one is promised — and every one of them is
 * unenforceable from a row that can be written on its own.
 */
export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<WorkflowDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.workflowDefinition.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByKeyAndVersion(
    tenantId: TenantId,
    key: string,
    version: number,
  ): Promise<WorkflowDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.workflowDefinition.findFirst({
        where: { key, version, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findPublishedByKey(tenantId: TenantId, key: string): Promise<WorkflowDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.workflowDefinition.findFirst({
        where: { key, status: "published", deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  findLatestByKey(tenantId: TenantId, key: string): Promise<WorkflowDefinition | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.workflowDefinition.findFirst({
        where: { key, deletedAt: null },
        orderBy: { version: "desc" },
      });
      return row ? toDomain(row) : null;
    });
  }

  listBySignal(tenantId: TenantId, signalKey: string): Promise<WorkflowDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.workflowDefinition.findMany({
        where: { triggerSignalKey: signalKey, status: "published", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<WorkflowDefinition[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.workflowDefinition.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(workflow: WorkflowDefinition): Promise<void> {
    return withTenant(this.db, workflow.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(workflow);
      await tx.workflowDefinition.upsert({
        where: { id: workflow.id },
        create: { id: workflow.id, ...fields },
        update: fields,
      });
    });
  }

  /** Soft-delete. Reachable only for a draft version — a published one is retired instead. */
  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.workflowDefinition.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
