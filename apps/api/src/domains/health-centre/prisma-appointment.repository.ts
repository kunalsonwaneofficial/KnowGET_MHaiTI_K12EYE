import { PrismaService, type TransactionClient, withTenant } from "@knowget/database";
import {
  type Appointment,
  type AppointmentRepository,
  type AppointmentStatus,
  OPEN_APPOINTMENT_STATUSES,
} from "@knowget/health-centre";
import { toIso } from "@knowget/shared";
import type { TenantId, Uuid } from "@knowget/types";

const OPEN = [...OPEN_APPOINTMENT_STATUSES];

interface AppointmentRow {
  id: string;
  tenantId: string;
  organizationId: string;
  centreId: string;
  patientId: string;
  clinicianId: string | null;
  scheduledFor: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: AppointmentRow): Appointment {
  return {
    id: row.id as Uuid,
    tenantId: row.tenantId as TenantId,
    organizationId: row.organizationId as Uuid,
    centreId: row.centreId as Uuid,
    patientId: row.patientId as Uuid,
    clinicianId: (row.clinicianId as Uuid | null) ?? null,
    scheduledFor: row.scheduledFor,
    status: row.status as AppointmentStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toFields(appt: Appointment) {
  return {
    tenantId: appt.tenantId,
    organizationId: appt.organizationId,
    centreId: appt.centreId,
    patientId: appt.patientId,
    clinicianId: appt.clinicianId,
    scheduledFor: appt.scheduledFor,
    status: appt.status,
  };
}

/** Prisma-backed {@link AppointmentRepository} (RLS via {@link withTenant}; soft delete). */
export class PrismaAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: PrismaService) {}

  findById(tenantId: TenantId, id: Uuid): Promise<Appointment | null> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const row = await tx.appointment.findFirst({ where: { id, deletedAt: null } });
      return row ? toDomain(row) : null;
    });
  }

  listByPatient(tenantId: TenantId, patientId: Uuid): Promise<Appointment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.appointment.findMany({ where: { patientId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByCentre(tenantId: TenantId, centreId: Uuid): Promise<Appointment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.appointment.findMany({ where: { centreId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listOpenByCentre(tenantId: TenantId, centreId: Uuid): Promise<Appointment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.appointment.findMany({
        where: { centreId, status: { in: OPEN }, deletedAt: null },
      });
      return rows.map(toDomain);
    });
  }

  listByOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Appointment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.appointment.findMany({ where: { organizationId, deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  listByTenant(tenantId: TenantId): Promise<Appointment[]> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      const rows = await tx.appointment.findMany({ where: { deletedAt: null } });
      return rows.map(toDomain);
    });
  }

  save(appointment: Appointment): Promise<void> {
    return withTenant(this.db, appointment.tenantId, async (tx: TransactionClient) => {
      const fields = toFields(appointment);
      await tx.appointment.upsert({
        where: { id: appointment.id },
        create: { id: appointment.id, ...fields },
        update: fields,
      });
    });
  }

  remove(tenantId: TenantId, id: Uuid): Promise<void> {
    return withTenant(this.db, tenantId, async (tx: TransactionClient) => {
      await tx.appointment.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
