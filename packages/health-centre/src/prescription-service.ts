import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isClinicianActive } from "./clinician";
import {
  ClinicianNotActiveError,
  ClinicianNotFoundError,
  HealthCentreNotActiveError,
  HealthCentreNotFoundError,
  PersonNotFoundForHealthCentreError,
  PrescriptionNotFoundError,
} from "./errors";
import { isHealthCentreActive } from "./health-centre";
import {
  prescriptionCompleted,
  prescriptionDiscontinued,
  prescriptionDoseRecorded,
  prescriptionIssued,
} from "./health-centre-events";
import type { MedicationSchedule } from "./health-centre-view";
import { computeMedicationSchedule } from "./medication-schedule";
import type {
  ClinicianRepository,
  HealthCentreRepository,
  PersonDirectory,
  PrescriptionRepository,
} from "./ports";
import {
  completePrescription,
  discontinuePrescription,
  type IssuePrescriptionParams,
  issuePrescription,
  type Prescription,
  recordDose,
} from "./prescription";

/** The issue input — the organization is derived from the centre, not supplied. */
export type IssuePrescriptionInput = Omit<IssuePrescriptionParams, "organizationId">;

export interface PrescriptionServiceDeps {
  readonly repository: PrescriptionRepository;
  readonly centres: HealthCentreRepository;
  readonly persons: PersonDirectory;
  readonly clinicians: ClinicianRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for prescriptions. Issues a medication course at an active centre (deriving the org
 * from the centre, validating the patient exists and the prescribing clinician is active), records doses,
 * and drives the `active → completed | discontinued` lifecycle, publishing the content-free prescription
 * events. `scheduleStatus` derives the due/overdue doses as of a date via the pure medication-schedule
 * engine — never stored.
 */
export class PrescriptionService {
  private readonly repository: PrescriptionRepository;
  private readonly centres: HealthCentreRepository;
  private readonly persons: PersonDirectory;
  private readonly clinicians: ClinicianRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: PrescriptionServiceDeps) {
    this.repository = deps.repository;
    this.centres = deps.centres;
    this.persons = deps.persons;
    this.clinicians = deps.clinicians;
    this.events = deps.events;
  }

  async issue(input: IssuePrescriptionInput): Promise<Prescription> {
    const centre = await this.activeCentre(input.tenantId, input.centreId);
    if (!(await this.persons.exists(input.tenantId, input.patientId))) {
      throw new PersonNotFoundForHealthCentreError(input.patientId);
    }
    await this.requireActiveClinician(input.tenantId, input.clinicianId);
    const prescription = issuePrescription({ ...input, organizationId: centre.organizationId });
    await this.repository.save(prescription);
    await this.emit(prescriptionIssued(prescription));
    return prescription;
  }

  async recordDose(tenantId: TenantId, id: Uuid, count = 1): Promise<Prescription> {
    const updated = recordDose(await this.require(tenantId, id), count);
    await this.repository.save(updated);
    await this.emit(prescriptionDoseRecorded(updated));
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<Prescription> {
    const updated = completePrescription(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(prescriptionCompleted(updated));
    return updated;
  }

  async discontinue(tenantId: TenantId, id: Uuid): Promise<Prescription> {
    const updated = discontinuePrescription(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(prescriptionDiscontinued(updated));
    return updated;
  }

  async scheduleStatus(
    tenantId: TenantId,
    id: Uuid,
    asOfDate: string,
  ): Promise<MedicationSchedule> {
    const p = await this.require(tenantId, id);
    return computeMedicationSchedule(
      p.startDate,
      p.frequencyPerDay,
      p.durationDays,
      p.dosesAdministered,
      asOfDate,
    );
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Prescription> {
    return this.require(tenantId, id);
  }

  async listForPatient(tenantId: TenantId, patientId: Uuid): Promise<Prescription[]> {
    return this.repository.listByPatient(tenantId, patientId);
  }

  async listForCentre(tenantId: TenantId, centreId: Uuid): Promise<Prescription[]> {
    return this.repository.listByCentre(tenantId, centreId);
  }

  async listActiveForCentre(tenantId: TenantId, centreId: Uuid): Promise<Prescription[]> {
    return this.repository.listActiveByCentre(tenantId, centreId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Prescription[]> {
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

  private async requireActiveClinician(tenantId: TenantId, clinicianId: Uuid): Promise<void> {
    const clinician = await this.clinicians.findById(tenantId, clinicianId);
    if (!clinician) {
      throw new ClinicianNotFoundError(clinicianId);
    }
    if (!isClinicianActive(clinician)) {
      throw new ClinicianNotActiveError(clinicianId);
    }
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<Prescription> {
    const prescription = await this.repository.findById(tenantId, id);
    if (!prescription) {
      throw new PrescriptionNotFoundError(id);
    }
    return prescription;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
