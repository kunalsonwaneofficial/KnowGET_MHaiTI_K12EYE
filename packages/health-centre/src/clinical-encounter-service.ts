import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  assignEncounterClinician,
  cancelEncounter,
  type ClinicalEncounter,
  completeEncounter,
  type OpenEncounterParams,
  openEncounter,
  recordAssessment,
  setChiefComplaint,
  setTriageAcuity,
  startEncounter,
} from "./clinical-encounter";
import { isClinicianActive } from "./clinician";
import {
  ClinicianNotActiveError,
  ClinicianNotFoundError,
  EncounterNotFoundError,
  HealthCentreNotActiveError,
  HealthCentreNotFoundError,
  PersonNotFoundForHealthCentreError,
} from "./errors";
import {
  encounterCancelled,
  encounterClinicianAssigned,
  encounterCompleted,
  encounterOpened,
  encounterStarted,
} from "./health-centre-events";
import { isHealthCentreActive } from "./health-centre";
import type { EncounterDisposition, TriageAcuity } from "./health-centre-value";
import type {
  ClinicianRepository,
  EncounterRepository,
  HealthCentreRepository,
  PersonDirectory,
} from "./ports";

/** The open input — the organization is derived from the centre, not supplied. */
export type OpenEncounterInput = Omit<OpenEncounterParams, "organizationId">;

export interface EncounterServiceDeps {
  readonly repository: EncounterRepository;
  readonly centres: HealthCentreRepository;
  readonly persons: PersonDirectory;
  readonly clinicians: ClinicianRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for clinical encounters. Opens an encounter at an active centre (deriving the
 * organization from the centre, validating the patient exists and any named clinician is active), assigns
 * the attending clinician, records the (content-free-at-the-event) clinical detail, and drives the
 * `draft → in_progress → completed | cancelled` lifecycle, publishing the content-free encounter events.
 */
export class EncounterService {
  private readonly repository: EncounterRepository;
  private readonly centres: HealthCentreRepository;
  private readonly persons: PersonDirectory;
  private readonly clinicians: ClinicianRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: EncounterServiceDeps) {
    this.repository = deps.repository;
    this.centres = deps.centres;
    this.persons = deps.persons;
    this.clinicians = deps.clinicians;
    this.events = deps.events;
  }

  async open(input: OpenEncounterInput): Promise<ClinicalEncounter> {
    const centre = await this.activeCentre(input.tenantId, input.centreId);
    await this.requirePatient(input.tenantId, input.patientId);
    if (input.clinicianId) {
      await this.requireActiveClinician(input.tenantId, input.clinicianId);
    }
    const encounter = openEncounter({ ...input, organizationId: centre.organizationId });
    await this.repository.save(encounter);
    await this.emit(encounterOpened(encounter));
    return encounter;
  }

  async setTriage(
    tenantId: TenantId,
    id: Uuid,
    triageAcuity: TriageAcuity,
  ): Promise<ClinicalEncounter> {
    return this.mutate(tenantId, id, (e) => setTriageAcuity(e, triageAcuity));
  }

  async setComplaint(
    tenantId: TenantId,
    id: Uuid,
    chiefComplaint: string | null,
  ): Promise<ClinicalEncounter> {
    return this.mutate(tenantId, id, (e) => setChiefComplaint(e, chiefComplaint));
  }

  async assignClinician(
    tenantId: TenantId,
    id: Uuid,
    clinicianId: Uuid,
  ): Promise<ClinicalEncounter> {
    await this.requireActiveClinician(tenantId, clinicianId);
    const updated = assignEncounterClinician(await this.require(tenantId, id), clinicianId);
    await this.repository.save(updated);
    await this.emit(encounterClinicianAssigned(updated));
    return updated;
  }

  async start(tenantId: TenantId, id: Uuid): Promise<ClinicalEncounter> {
    const updated = startEncounter(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(encounterStarted(updated));
    return updated;
  }

  async recordAssessment(
    tenantId: TenantId,
    id: Uuid,
    assessment: string | null,
  ): Promise<ClinicalEncounter> {
    return this.mutate(tenantId, id, (e) => recordAssessment(e, assessment));
  }

  async complete(
    tenantId: TenantId,
    id: Uuid,
    disposition: EncounterDisposition,
  ): Promise<ClinicalEncounter> {
    const updated = completeEncounter(await this.require(tenantId, id), disposition);
    await this.repository.save(updated);
    await this.emit(encounterCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<ClinicalEncounter> {
    const updated = cancelEncounter(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(encounterCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<ClinicalEncounter> {
    return this.require(tenantId, id);
  }

  async listForPatient(tenantId: TenantId, patientId: Uuid): Promise<ClinicalEncounter[]> {
    return this.repository.listByPatient(tenantId, patientId);
  }

  async listForCentre(tenantId: TenantId, centreId: Uuid): Promise<ClinicalEncounter[]> {
    return this.repository.listByCentre(tenantId, centreId);
  }

  async listOpenForCentre(tenantId: TenantId, centreId: Uuid): Promise<ClinicalEncounter[]> {
    return this.repository.listOpenByCentre(tenantId, centreId);
  }

  async listForOrganization(
    tenantId: TenantId,
    organizationId: Uuid,
  ): Promise<ClinicalEncounter[]> {
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

  private async mutate(
    tenantId: TenantId,
    id: Uuid,
    fn: (encounter: ClinicalEncounter) => ClinicalEncounter,
  ): Promise<ClinicalEncounter> {
    const updated = fn(await this.require(tenantId, id));
    await this.repository.save(updated);
    return updated;
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<ClinicalEncounter> {
    const encounter = await this.repository.findById(tenantId, id);
    if (!encounter) {
      throw new EncounterNotFoundError(id);
    }
    return encounter;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
