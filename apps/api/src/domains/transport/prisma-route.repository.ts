import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import type {
  Route,
  RouteDirection,
  RouteRepository,
  RouteStatus,
  RouteStop,
} from "@knowget/transport";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface RouteRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  direction: string;
  departureMinutes: number;
  stops: unknown;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: RouteRow): Route {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    direction: row.direction as RouteDirection,
    departureMinutes: row.departureMinutes,
    stops: (row.stops as RouteStop[]) ?? [],
    status: row.status as RouteStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(route: Route) {
  return {
    tenantId: route.tenantId,
    organizationId: route.organizationId,
    code: route.code,
    name: route.name,
    direction: route.direction,
    departureMinutes: route.departureMinutes,
    stops: JSON.parse(JSON.stringify(route.stops)),
    status: route.status,
  };
}

/** Prisma-backed {@link RouteRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaRouteRepository implements RouteRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Route | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.route.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<Route | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.route.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Route[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.route.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Route[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.route.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(route: Route): Promise<void> {
    return withTenant(this.db, route.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(route);
      await tx.route.upsert({
        where: { id: route.id },
        create: { id: route.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.route.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
