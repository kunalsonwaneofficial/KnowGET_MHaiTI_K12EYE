import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type Appointment,
  cancelAppointment,
  checkInAppointment,
  completeAppointment,
  markAppointmentNoShow,
  type RequestAppointmentParams,
  requestAppointment,
  rescheduleAppointment,
  scheduleAppointment,
} from "./appointment";
import { isClinicianActive } from "./clinician";
import {
  AppointmentNotFoundError,
  ClinicianNotActiveError,
  ClinicianNotFoundError,
  HealthCentreNotActiveError,
  HealthCentreNotFoundError,
  PersonNotFoundForHealthCentreError,
} from "./errors";
import {
  appointmentCancelled,
  appointmentCheckedIn,
  appointmentCompleted,
  appointmentNoShow,
  appointmentRequested,
  appointmentScheduled,
} from "./health-centre-events";
import { isHealthCentreActive } from "./health-centre";
import type {
  AppointmentRepository,
  ClinicianRepository,
  HealthCentreRepository,
  PersonDirectory,
} from "./ports";

/** The request input — the organization is derived from the centre, not supplied. */
export type RequestAppointmentInput = Omit<RequestAppointmentParams, "organizationId">;

export interface AppointmentServiceDeps {
  readonly repository: AppointmentRepository;
  readonly centres: HealthCentreRepository;
  readonly persons: PersonDirectory;
  readonly clinicians: ClinicianRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for appointments. Requests a visit at an active centre (deriving the organization
 * from the centre, validating the patient exists and any named clinician is active), and drives the
 * `requested → scheduled → checked_in → completed | cancelled | no_show` lifecycle, publishing the
 * appointment events.
 */
export class AppointmentService {
  private readonly repository: AppointmentRepository;
  private readonly centres: HealthCentreRepository;
  private readonly persons: PersonDirectory;
  private readonly clinicians: ClinicianRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AppointmentServiceDeps) {
    this.repository = deps.repository;
    this.centres = deps.centres;
    this.persons = deps.persons;
    this.clinicians = deps.clinicians;
    this.events = deps.events;
  }

  async request(input: RequestAppointmentInput): Promise<Appointment> {
    const centre = await this.activeCentre(input.tenantId, input.centreId);
    await this.requirePatient(input.tenantId, input.patientId);
    if (input.clinicianId) {
      await this.requireActiveClinician(input.tenantId, input.clinicianId);
    }
    const appt = requestAppointment({ ...input, organizationId: centre.organizationId });
    await this.repository.save(appt);
    await this.emit(appointmentRequested(appt));
    return appt;
  }

  async schedule(tenantId: TenantId, id: Uuid, clinicianId?: Uuid | null): Promise<Appointment> {
    if (clinicianId) {
      await this.requireActiveClinician(tenantId, clinicianId);
    }
    const updated = scheduleAppointment(await this.require(tenantId, id), clinicianId);
    await this.repository.save(updated);
    await this.emit(appointmentScheduled(updated));
    return updated;
  }

  async reschedule(tenantId: TenantId, id: Uuid, scheduledFor: string): Promise<Appointment> {
    const updated = rescheduleAppointment(await this.require(tenantId, id), scheduledFor);
    await this.repository.save(updated);
    await this.emit(appointmentScheduled(updated));
    return updated;
  }

  async checkIn(tenantId: TenantId, id: Uuid): Promise<Appointment> {
    const updated = checkInAppointment(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(appointmentCheckedIn(updated));
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<Appointment> {
    const updated = completeAppointment(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(appointmentCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Appointment> {
    const updated = cancelAppointment(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(appointmentCancelled(updated));
    return updated;
  }

  async markNoShow(tenantId: TenantId, id: Uuid): Promise<Appointment> {
    const updated = markAppointmentNoShow(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(appointmentNoShow(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Appointment> {
    return this.require(tenantId, id);
  }

  async listForPatient(tenantId: TenantId, patientId: Uuid): Promise<Appointment[]> {
    return this.repository.listByPatient(tenantId, patientId);
  }

  async listForCentre(tenantId: TenantId, centreId: Uuid): Promise<Appointment[]> {
    return this.repository.listByCentre(tenantId, centreId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Appointment[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async activeCentre(tenantId: TenantId, centreId: Uuid) {
    const centre = await this.centres.findById(tenantId, centreId);
    if (!centre) {
      throw new HealthCentreNotFoundError(centreId);
    }
    if (!isHealthCentreActive(centre)) {
      throw new HealthCentreNotActiveError(centreId);
    }
    return centre;
  }

  private async requirePatient(tenantId: TenantId, patientId: Uuid): Promise<void> {
    if (!(await this.persons.exists(tenantId, patientId))) {
      throw new PersonNotFoundForHealthCentreError(patientId);
    }
  }

  private async requireActiveClinician(tenantId: TenantId, clinicianId: Uuid): Promise<void> {
    const clinician = await this.clinicians.findById(tenantId, clinicianId);
    if (!clinician) {
      throw new ClinicianNotFoundError(clinicianId);
    }
    if (!isClinicianActive(clinician)) {
      throw new ClinicianNotActiveError(clinicianId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Appointment> {
    const appt = await this.repository.findById(tenantId, id);
    if (!appt) {
      throw new AppointmentNotFoundError(id);
    }
    return appt;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
