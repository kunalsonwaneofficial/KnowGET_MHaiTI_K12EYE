import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type ActionView,
  type AutomationCondition,
  type AutomationRule,
  type AutomationRuleRepository,
  type AutonomyMode,
  type RuleStatus,
} from "@knowget/decision-intelligence";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface AutomationRuleRow {
  id: string;
  tenantId: string;
  organizationId: string;
  key: string;
  name: string;
  description: string | null;
  signalKey: string;
  conditions: unknown;
  action: unknown;
  autonomyMode: string;
  status: string;
  createdByUserId: string | null;
  activatedAt: string | null;
  activatedByUserId: string | null;
  pausedAt: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AutomationRuleRow): AutomationRule {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    key: row.key,
    name: row.name,
    description: row.description,
    signalKey: row.signalKey,
    conditions: (row.conditions as AutomationCondition[]) ?? [],
    action: row.action as ActionView,
    autonomyMode: row.autonomyMode as AutonomyMode,
    status: row.status as RuleStatus,
    createdByUserId: row.createdByUserId,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    activatedByUserId: row.activatedByUserId,
    pausedAt: (row.pausedAt as ISODateString | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(rule: AutomationRule) {
  return {
    tenantId: rule.tenantId,
    organizationId: rule.organizationId,
    key: rule.key,
    name: rule.name,
    description: rule.description,
    signalKey: rule.signalKey,
    conditions: JSON.parse(JSON.stringify(rule.conditions)),
    action: JSON.parse(JSON.stringify(rule.action)),
    autonomyMode: rule.autonomyMode,
    status: rule.status,
    createdByUserId: rule.createdByUserId,
    activatedAt: rule.activatedAt,
    activatedByUserId: rule.activatedByUserId,
    pausedAt: rule.pausedAt,
    retiredAt: rule.retiredAt,
  };
}

/**
 * Prisma-backed {@link AutomationRuleRepository} (RLS via {@link withTenant}).
 *
 * `listBySignal` filters to active rules in the query rather than in memory, and that it filters at all is
 * deliberate: it exists to answer "what fires on this observation", and a paused rule fires on nothing. The
 * alternative — load every rule the institution has ever written and filter after — is both slower and one
 * forgotten predicate away from a retired rule acting on a live student. The composite index on
 * (tenant_id, signal_key, status) is what this read is for.
 *
 * `remove` is a soft-delete and is reachable only while a rule is still editable; an armed rule is retired
 * instead, because `activated_by_user_id` is the institution's answer to "who allowed this to run" and that
 * answer has to survive the rule being taken out of service.
 */
export class PrismaAutomationRuleRepository implements AutomationRuleRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AutomationRule | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.automationRule.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByKey(tenantId: TenantId, key: string): Promise<AutomationRule | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.automationRule.findFirst({ where: { key, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listBySignal(tenantId: TenantId, signalKey: string): Promise<AutomationRule[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.automationRule.findMany({
        where: { signalKey, status: "active", deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AutomationRule[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.automationRule.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(rule: AutomationRule): Promise<void> {
    return withTenant(this.db, rule.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(rule);
      await tx.automationRule.upsert({
        where: { id: rule.id },
        create: { id: rule.id, ...fields },
        update: fields,
      });
    });
  }

  /** Soft-delete. Reachable only while the rule is still editable — an armed one is retired instead. */
  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.automationRule.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
