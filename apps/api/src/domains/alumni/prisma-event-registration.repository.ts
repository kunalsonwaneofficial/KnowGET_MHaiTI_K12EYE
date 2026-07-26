import type {
  EventRegistration,
  EventRegistrationRepository,
  RegistrationStatus,
} from "@knowget/alumni";
import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

interface EventRegistrationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  eventId: string;
  alumniProfileId: string;
  status: string;
  registeredOn: string;
  respondedOn: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: EventRegistrationRow): EventRegistration {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    eventId: row.eventId as Uuid,
    alumniProfileId: row.alumniProfileId as Uuid,
    status: row.status as RegistrationStatus,
    registeredOn: row.registeredOn,
    respondedOn: row.respondedOn,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(registration: EventRegistration) {
  return {
    tenantId: registration.tenantId,
    organizationId: registration.organizationId,
    eventId: registration.eventId,
    alumniProfileId: registration.alumniProfileId,
    status: registration.status,
    registeredOn: registration.registeredOn,
    respondedOn: registration.respondedOn,
  };
}

/** Prisma-backed {@link EventRegistrationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaEventRegistrationRepository implements EventRegistrationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<EventRegistration | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.eventRegistration.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findByEventAndAlumnus(
    tenantId: TenantId,
    eventId: Uuid,
    alumniProfileId: Uuid,
  ): Promise<EventRegistration | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.eventRegistration.findFirst({
        where: { eventId, alumniProfileId, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listByEvent(tenantId: TenantId, eventId: Uuid): Promise<EventRegistration[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventRegistration.findMany({ where: { eventId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<EventRegistration[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventRegistration.findMany({
        where: { alumniProfileId, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  countConfirmedByEvent(tenantId: TenantId, eventId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.eventRegistration.count({
        where: { eventId, status: { not: "cancelled" }, deletedAt: null },
      });
    });
  }

  countAttendedByEvent(tenantId: TenantId, eventId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.eventRegistration.count({
        where: { eventId, status: "attended", deletedAt: null },
      });
    });
  }

  countAttendedByAlumnus(tenantId: TenantId, alumniProfileId: Uuid): Promise<number> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      return tx.eventRegistration.count({
        where: { alumniProfileId, status: "attended", deletedAt: null },
      });
    });
  }

  listByTenant(tenantId: TenantId): Promise<EventRegistration[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.eventRegistration.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(registration: EventRegistration): Promise<void> {
    return withTenant(this.db, registration.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(registration);
      await tx.eventRegistration.upsert({
        where: { id: registration.id },
        create: { id: registration.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.eventRegistration.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
