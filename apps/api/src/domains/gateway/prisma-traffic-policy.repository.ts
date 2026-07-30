import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type PolicyLimits,
  type PolicyScope,
  type TrafficPolicy,
  type TrafficPolicyRepository,
} from "@knowget/gateway";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface TrafficPolicyRow {
  id: string;
  tenantId: string;
  organizationId: string;
  scope: string;
  consumerId: string | null;
  capabilityKey: string | null;
  displayName: string;
  limits: unknown;
  active: boolean;
  deactivatedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Read the stored limits as five explicit values.
 *
 * The column's default is an empty object, so a key can legitimately be absent from a row this adapter did not
 * write. Every limit predicate in the engines tests `=== null`, and an absent key read straight off the JSON
 * would arrive as `undefined`: it would fail that test, survive as *some* limit, and reach the arithmetic that
 * compares it against a count. Mapping field by field turns a missing key into the unmetered answer the engines
 * already know how to handle, which is the difference between a policy that does not constrain something and a
 * quota verdict computed from `NaN`.
 */
function toLimits(value: unknown): PolicyLimits {
  const raw = (value ?? {}) as Partial<PolicyLimits>;
  return {
    requestsPerWindow: raw.requestsPerWindow ?? null,
    window: raw.window ?? null,
    burstAllowance: raw.burstAllowance ?? null,
    maxPayloadBytes: raw.maxPayloadBytes ?? null,
    timeoutMs: raw.timeoutMs ?? null,
  };
}

function toDomain(row: TrafficPolicyRow): TrafficPolicy {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    scope: row.scope as PolicyScope,
    consumerId: (row.consumerId as Uuid | null) ?? null,
    capabilityKey: row.capabilityKey,
    displayName: row.displayName,
    limits: toLimits(row.limits),
    active: row.active,
    deactivatedAt: (row.deactivatedAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(policy: TrafficPolicy) {
  return {
    tenantId: policy.tenantId,
    organizationId: policy.organizationId,
    scope: policy.scope,
    consumerId: policy.consumerId,
    capabilityKey: policy.capabilityKey,
    displayName: policy.displayName,
    limits: JSON.parse(JSON.stringify(policy.limits)),
    active: policy.active,
    deactivatedAt: policy.deactivatedAt,
  };
}

/**
 * Prisma-backed {@link TrafficPolicyRepository} (RLS via {@link withTenant}).
 *
 * `findActiveByScopeTuple` filters on `active` because the rule it serves is that one policy is *in force* on a
 * tuple, not that one row exists on it. Deactivation releases a tuple, so a tuple accumulates a history of
 * policies that no longer apply, and a lookup that returned any row on it would answer the question *is this
 * tuple free* with a record that stopped mattering months ago. Filtering here makes the read single-row by
 * construction and puts it in exact correspondence with the partial unique index that enforces the same rule in
 * the database.
 *
 * The nullable halves of the tuple are passed to Prisma as `null` and reach SQL as `IS NULL`, which is the whole
 * reason that index is declared `NULLS NOT DISTINCT`. Under the default nulls-distinct behaviour a global policy
 * — the tuple with both nulls — would be exempt from uniqueness entirely, and the one policy every request in
 * the tenant falls back to would be the one policy that could quietly exist twice.
 *
 * `limits` is the only JSONB column in this domain, and it earns it: five named limits that are read together,
 * written together and never queried individually. The flat string lists elsewhere in the gateway are `TEXT[]`
 * for the opposite reason.
 *
 * There is no `listByConsumer` and no `remove`. The first is absent because it reads as the obvious way to ask
 * *what limits apply to this integration* and answers it wrongly — the policy that actually governs a consumer
 * is very often a capability or global one they are not named in, and selection over `listActive` is the only
 * correct answer. The second is absent because a deactivated policy is the record of what an integration was
 * held to at the time somebody is asking why it was throttled.
 */
export class PrismaTrafficPolicyRepository implements TrafficPolicyRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<TrafficPolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.trafficPolicy.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The policy in force on this tuple, if there is one. At most one can be, by the rule this read serves. */
  findActiveByScopeTuple(
    tenantId: TenantId,
    organizationId: Uuid,
    scope: PolicyScope,
    consumerId: Uuid | null,
    capabilityKey: string | null,
  ): Promise<TrafficPolicy | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.trafficPolicy.findFirst({
        where: { organizationId, scope, consumerId, capabilityKey, active: true },
      });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The candidate set the policy engine resolves over — the entirety of what selection needs.
   *
   * Selection is a pure function of the candidates and the request, and because a deactivated policy is excluded
   * here rather than skipped there, turning a policy off is a fact about the record rather than a behaviour of
   * whoever remembered to filter. The order below is for a human reading a list; it carries no weight in
   * selection, which decides by scope specificity and not by anything a query could sort on.
   */
  listActive(tenantId: TenantId, organizationId: Uuid): Promise<TrafficPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.trafficPolicy.findMany({
        where: { organizationId, active: true },
        orderBy: [{ scope: "asc" }, { displayName: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<TrafficPolicy[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.trafficPolicy.findMany({
        orderBy: [{ scope: "asc" }, { displayName: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(policy: TrafficPolicy): Promise<void> {
    return withTenant(this.db, policy.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(policy);
      await tx.trafficPolicy.upsert({
        where: { id: policy.id },
        create: { id: policy.id, ...fields },
        update: fields,
      });
    });
  }
}
