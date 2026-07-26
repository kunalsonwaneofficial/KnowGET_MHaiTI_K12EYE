import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  OPEN_RESERVATION_STATUSES,
  type Reservation,
  type ReservationRepository,
  type ReservationStatus,
} from "@knowget/library";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

const OPEN = [...OPEN_RESERVATION_STATUSES];

interface ReservationRow {
  id: string;
  tenantId: string;
  organizationId: string;
  titleId: string;
  memberId: string;
  requestedOn: string;
  queuePosition: number;
  readyOn: string | null;
  expiresOn: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: ReservationRow): Reservation {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    titleId: row.titleId as Uuid,
    memberId: row.memberId as Uuid,
    requestedOn: row.requestedOn,
    queuePosition: row.queuePosition,
    readyOn: row.readyOn,
    expiresOn: row.expiresOn,
    status: row.status as ReservationStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(reservation: Reservation) {
  return {
    tenantId: reservation.tenantId,
    organizationId: reservation.organizationId,
    titleId: reservation.titleId,
    memberId: reservation.memberId,
    requestedOn: reservation.requestedOn,
    queuePosition: reservation.queuePosition,
    readyOn: reservation.readyOn,
    expiresOn: reservation.expiresOn,
    status: reservation.status,
  };
}

/** Prisma-backed {@link ReservationRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaReservationRepository implements ReservationRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Reservation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.reservation.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  findOpenByMemberAndTitle(
    tenantId: TenantId,
    memberId: Uuid,
    titleId: Uuid,
  ): Promise<Reservation | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.reservation.findFirst({
        where: { memberId, titleId, status: { in: OPEN }, deletedAt: null },
      });
      return row ? toDomain(row) : null;
    });
  }

  listOpenByTitle(tenantId: TenantId, titleId: Uuid): Promise<Reservation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.reservation.findMany({
        where: { titleId, status: { in: OPEN }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByTitle(tenantId: TenantId, titleId: Uuid): Promise<Reservation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.reservation.findMany({ where: { titleId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByMember(tenantId: TenantId, memberId: Uuid): Promise<Reservation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.reservation.findMany({ where: { memberId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Reservation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.reservation.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Reservation[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.reservation.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(reservation: Reservation): Promise<void> {
    return withTenant(this.db, reservation.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(reservation);
      await tx.reservation.upsert({
        where: { id: reservation.id },
        create: { id: reservation.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.reservation.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
