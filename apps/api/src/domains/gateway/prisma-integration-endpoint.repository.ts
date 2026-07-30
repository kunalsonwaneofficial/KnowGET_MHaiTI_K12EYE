import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type CircuitPosture,
  type EndpointHealth,
  type EndpointStatus,
  type IntegrationEndpoint,
  type IntegrationEndpointRepository,
  type IntegrationProtocol,
} from "@knowget/gateway";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface IntegrationEndpointRow {
  id: string;
  tenantId: string;
  organizationId: string;
  endpointKey: string;
  displayName: string;
  protocol: string;
  adapterKey: string;
  credentialRef: string | null;
  status: string;
  health: string;
  posture: string;
  consecutiveFailures: number;
  postureSince: string;
  circuitOpenedAt: string | null;
  lastOutcomeAt: string | null;
  activatedAt: string | null;
  quarantinedAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: IntegrationEndpointRow): IntegrationEndpoint {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    endpointKey: row.endpointKey,
    displayName: row.displayName,
    protocol: row.protocol as IntegrationProtocol,
    adapterKey: row.adapterKey,
    credentialRef: row.credentialRef,
    status: row.status as EndpointStatus,
    health: row.health as EndpointHealth,
    posture: row.posture as CircuitPosture,
    consecutiveFailures: row.consecutiveFailures,
    postureSince: row.postureSince as ISODateString,
    circuitOpenedAt: (row.circuitOpenedAt as ISODateString | null) ?? null,
    lastOutcomeAt: (row.lastOutcomeAt as ISODateString | null) ?? null,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    quarantinedAt: (row.quarantinedAt as ISODateString | null) ?? null,
    disabledAt: (row.disabledAt as ISODateString | null) ?? null,
    disabledReason: row.disabledReason,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(endpoint: IntegrationEndpoint) {
  return {
    tenantId: endpoint.tenantId,
    organizationId: endpoint.organizationId,
    endpointKey: endpoint.endpointKey,
    displayName: endpoint.displayName,
    protocol: endpoint.protocol,
    adapterKey: endpoint.adapterKey,
    credentialRef: endpoint.credentialRef,
    status: endpoint.status,
    health: endpoint.health,
    posture: endpoint.posture,
    consecutiveFailures: endpoint.consecutiveFailures,
    postureSince: endpoint.postureSince,
    circuitOpenedAt: endpoint.circuitOpenedAt,
    lastOutcomeAt: endpoint.lastOutcomeAt,
    activatedAt: endpoint.activatedAt,
    quarantinedAt: endpoint.quarantinedAt,
    disabledAt: endpoint.disabledAt,
    disabledReason: endpoint.disabledReason,
    retiredAt: endpoint.retiredAt,
  };
}

/**
 * Prisma-backed {@link IntegrationEndpointRepository} (RLS via {@link withTenant}).
 *
 * `credentialRef` is nullable here and not on a consumer, and the asymmetry is deliberate. A consumer is
 * something that presents a credential to us, so there is always a handle to the material we check it against. An
 * endpoint is something we call, and a real institution has endpoints that need no material of ours at all —
 * authenticated at the transport by a client certificate the platform did not mint, or reachable only from inside
 * a network that is itself the credential. `null` records that this deployment holds no handle for it, which is a
 * different fact from an empty string and worth being able to tell apart. When a handle *is* present the value
 * objects still refuse anything that looks like the secret itself, so the column cannot become a place a key
 * lands by accident.
 *
 * `listCallable` filters on `status` and not on `health`, and both columns exist because neither can be derived
 * from the other. Status is a decision somebody made; health is an observation the fabric recorded. An unreachable
 * endpoint that nobody has quarantined is still one the fabric will attempt, and a healthy endpoint that was
 * disabled this morning is one it will not. The question this read answers is whether calls may go out, and only
 * status answers it.
 *
 * `listOpenCircuits` takes no organization, because a broken integration is an operational fact about the tenant
 * and the sweep that acts on it is not scoped to one school in a group. It filters on `circuitOpenedAt` rather
 * than on the posture, for the reason the aggregate is careful about: an open circuit probes and re-opens, moving
 * `postureSince` each time, so an endpoint that has been failing since dawn looks a minute old to anything
 * measuring from the posture. Ordering oldest-first puts the longest-broken integration at the top, which is both
 * the one the sweep should quarantine first and the one an operator reading down the list needs to see.
 *
 * There is no `remove`. Every delivery ever attempted names an endpoint id, and a retired endpoint's row is what
 * turns a dead-letter queue full of ids into a list somebody can act on.
 */
export class PrismaIntegrationEndpointRepository implements IntegrationEndpointRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<IntegrationEndpoint | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.integrationEndpoint.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** The key lookup behind the one-endpoint-per-key rule — and the name every log line refers to. */
  findByKey(tenantId: TenantId, endpointKey: string): Promise<IntegrationEndpoint | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.integrationEndpoint.findFirst({ where: { endpointKey } });
      return row ? toDomain(row) : null;
    });
  }

  /** What the fabric may currently attempt anything against. */
  listCallable(tenantId: TenantId, organizationId: Uuid): Promise<IntegrationEndpoint[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.integrationEndpoint.findMany({
        where: { organizationId, status: "active" },
        orderBy: { endpointKey: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  /**
   * The quarantine sweep's input: every endpoint whose circuit is open, longest-broken first.
   *
   * A circuit reopening on its own is an incident. An endpoint that has been failing since this morning is
   * somebody's task, and nothing turns the first into the second except this read running.
   */
  listOpenCircuits(tenantId: TenantId): Promise<IntegrationEndpoint[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.integrationEndpoint.findMany({
        where: { circuitOpenedAt: { not: null } },
        orderBy: { circuitOpenedAt: "asc" },
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<IntegrationEndpoint[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.integrationEndpoint.findMany({ orderBy: { endpointKey: "asc" } });
      return rows.map(toDomain);
    });
  }

  save(endpoint: IntegrationEndpoint): Promise<void> {
    return withTenant(this.db, endpoint.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(endpoint);
      await tx.integrationEndpoint.upsert({
        where: { id: endpoint.id },
        create: { id: endpoint.id, ...fields },
        update: fields,
      });
    });
  }
}
