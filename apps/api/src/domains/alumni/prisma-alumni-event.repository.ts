import type { AlumniEvent, AlumniEventRepository, EventStatus, EventType } from "@knowget/alumni";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface AlumniEventRow {
  id: string;
  tenantId: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  capacity: number;
  startsOn: string | null;
  endsOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AlumniEventRow): AlumniEvent {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    code: row.code,
    name: row.name,
    type: row.type as EventType,
    capacity: row.capacity,
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    status: row.status as EventStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(event: AlumniEvent) {
  return {
    tenantId: event.tenantId,
    organizationId: event.organizationId,
    code: event.code,
    name: event.name,
    type: event.type,
    capacity: event.capacity,
    startsOn: event.startsOn,
    endsOn: event.endsOn,
    status: event.status,
  };
}

/** Prisma-backed {@link AlumniEventRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAlumniEventRepository implements AlumniEventRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<AlumniEvent | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.alumniEvent.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByCode(tenantId: TenantId, code: string): Promise<AlumniEvent | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.alumniEvent.findFirst({ where: { code, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<AlumniEvent[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.alumniEvent.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<AlumniEvent[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.alumniEvent.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(event: AlumniEvent): Promise<void> {
    return withTenant(this.db, event.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(event);
      await tx.alumniEvent.upsert({
        where: { id: event.id },
        create: { id: event.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.alumniEvent.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
