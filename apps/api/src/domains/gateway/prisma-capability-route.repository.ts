import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type CapabilityRoute,
  type CapabilityRouteRepository,
  type ContractStyle,
  type HttpMethod,
  type RouteStatus,
} from "@knowget/gateway";
import { toIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";

interface CapabilityRouteRow {
  id: string;
  tenantId: string;
  organizationId: string;
  contractId: string;
  capabilityKey: string;
  contractVersion: string;
  method: string;
  externalPath: string;
  pathParameters: string[];
  style: string;
  status: string;
  requiredScope: string;
  internalTarget: string;
  idempotent: boolean;
  activatedAt: string | null;
  retiredAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: CapabilityRouteRow): CapabilityRoute {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    contractId: row.contractId as Uuid,
    capabilityKey: row.capabilityKey,
    contractVersion: row.contractVersion,
    method: row.method as HttpMethod,
    externalPath: row.externalPath,
    pathParameters: row.pathParameters,
    style: row.style as ContractStyle,
    status: row.status as RouteStatus,
    requiredScope: row.requiredScope,
    internalTarget: row.internalTarget,
    idempotent: row.idempotent,
    activatedAt: (row.activatedAt as ISODateString | null) ?? null,
    retiredAt: (row.retiredAt as ISODateString | null) ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(route: CapabilityRoute) {
  return {
    tenantId: route.tenantId,
    organizationId: route.organizationId,
    contractId: route.contractId,
    capabilityKey: route.capabilityKey,
    contractVersion: route.contractVersion,
    method: route.method,
    externalPath: route.externalPath,
    pathParameters: [...route.pathParameters],
    style: route.style,
    status: route.status,
    requiredScope: route.requiredScope,
    internalTarget: route.internalTarget,
    idempotent: route.idempotent,
    activatedAt: route.activatedAt,
    retiredAt: route.retiredAt,
  };
}

/**
 * Prisma-backed {@link CapabilityRouteRepository} (RLS via {@link withTenant}).
 *
 * This adapter is where `internalTarget` becomes a value in a process, and that makes it the layer everything
 * above it has to be careful about. The rule the package states is that the target appears in no view, no event
 * and no error; a route *record* carries it, so nothing between here and an HTTP response may hand a caller a
 * route record. That is why the controller over this domain answers with route candidates and public views
 * rather than routes, and why the rule is worth restating at the one place the column is actually read.
 *
 * `findByMethodAndPath` deliberately does not filter on status, because the caller's question is *who holds this
 * address* and the answer includes a holder that has been retired. What it does add is an ordering the in-memory
 * repository cannot express: an address may legitimately carry several retired routes and at most one live one,
 * so the fetch prefers a row that has not been retired. Without that, an address that was retired and
 * re-registered would answer with whichever row the planner reached first — the registration guard would pass on
 * a retired holder, and the collision would surface as a unique-constraint violation from the partial index
 * rather than as the domain error that exists to describe it. The index enforcing one live route per address is
 * partial on exactly the same condition, so this read and that constraint agree by construction.
 *
 * `pathParameters` is `TEXT[]` written as a plain array. The parameter names extracted from a path template are
 * a flat list of strings, and putting them through JSON would cost the ability to read them with an ordinary
 * `= ANY` while buying structure the column has no use for.
 *
 * There is no `remove`. A retired route is the record that an address used to answer, which is the only thing
 * that explains a 404 to an integrator whose code was written against it.
 */
export class PrismaCapabilityRouteRepository implements CapabilityRouteRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<CapabilityRoute | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.capabilityRoute.findFirst({ where: { id } });
      return row ? toDomain(row) : null;
    });
  }

  /** Who holds this public address, preferring a live holder over a retired one. */
  findByMethodAndPath(
    tenantId: TenantId,
    method: HttpMethod,
    externalPath: string,
  ): Promise<CapabilityRoute | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.capabilityRoute.findFirst({
        where: { method, externalPath },
        orderBy: { retiredAt: { sort: "asc", nulls: "first" } },
      });
      return row ? toDomain(row) : null;
    });
  }

  /**
   * The routing table itself — the read the fabric is built around.
   *
   * A draft route is excluded because registering an address and publishing it are two decisions, and a fabric
   * that served drafts would make the first of them irreversible.
   */
  listActive(tenantId: TenantId, organizationId: Uuid): Promise<CapabilityRoute[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.capabilityRoute.findMany({
        where: { organizationId, status: "active" },
        orderBy: [{ externalPath: "asc" }, { method: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  /**
   * Every address one contract version publishes, which is what makes its lifecycle enforceable.
   *
   * Sunsetting a version is a claim about all of them at once, and a claim nobody can enumerate is a claim
   * nobody can keep.
   */
  listByContract(tenantId: TenantId, contractId: Uuid): Promise<CapabilityRoute[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.capabilityRoute.findMany({
        where: { contractId },
        orderBy: [{ externalPath: "asc" }, { method: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<CapabilityRoute[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.capabilityRoute.findMany({
        orderBy: [{ externalPath: "asc" }, { method: "asc" }],
      });
      return rows.map(toDomain);
    });
  }

  save(route: CapabilityRoute): Promise<void> {
    return withTenant(this.db, route.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(route);
      await tx.capabilityRoute.upsert({
        where: { id: route.id },
        create: { id: route.id, ...fields },
        update: fields,
      });
    });
  }
}
