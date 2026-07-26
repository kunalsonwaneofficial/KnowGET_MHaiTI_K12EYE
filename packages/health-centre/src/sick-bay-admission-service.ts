import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  AdmissionNotFoundError,
  BedOccupiedError,
  HealthCentreNotActiveError,
  HealthCentreNotFoundError,
  PatientAlreadyAdmittedError,
  PersonNotFoundForHealthCentreError,
  SickBayFullError,
} from "./errors";
import { isHealthCentreActive } from "./health-centre";
import { admissionDischarged, admissionOpened } from "./health-centre-events";
import type { BayOccupancy } from "./health-centre-view";
import { computeBayOccupancy } from "./occupancy";
import type { AdmissionRepository, HealthCentreRepository, PersonDirectory } from "./ports";
import {
  admitToSickBay,
  type AdmitToSickBayParams,
  dischargeFromSickBay,
  type SickBayAdmission,
} from "./sick-bay-admission";

/** The admit input — the organization is derived from the centre, not supplied. */
export type AdmitToSickBayInput = Omit<AdmitToSickBayParams, "organizationId">;

export interface AdmissionServiceDeps {
  readonly repository: AdmissionRepository;
  readonly centres: HealthCentreRepository;
  readonly persons: PersonDirectory;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for sick-bay admissions. Admits a patient to a bed at an active centre — deriving the
 * org from the centre, validating the patient exists, and enforcing that the sick bay is not at capacity,
 * the bed is free, and the patient is not already admitted (the two status-scoped uniqueness invariants,
 * TD-39) — and drives the `active → discharged` lifecycle, publishing the admission events. `occupancy`
 * derives the sick-bay bed usage via the pure occupancy engine — never stored.
 */
export class AdmissionService {
  private readonly repository: AdmissionRepository;
  private readonly centres: HealthCentreRepository;
  private readonly persons: PersonDirectory;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AdmissionServiceDeps) {
    this.repository = deps.repository;
    this.centres = deps.centres;
    this.persons = deps.persons;
    this.events = deps.events;
  }

  async admit(input: AdmitToSickBayInput): Promise<SickBayAdmission> {
    const centre = await this.activeCentre(input.tenantId, input.centreId);
    if (!(await this.persons.exists(input.tenantId, input.patientId))) {
      throw new PersonNotFoundForHealthCentreError(input.patientId);
    }
    if (await this.repository.findActiveByPatient(input.tenantId, input.patientId)) {
      throw new PatientAlreadyAdmittedError(input.patientId);
    }
    if (
      await this.repository.findActiveByBed(input.tenantId, input.centreId, input.bedLabel.trim())
    ) {
      throw new BedOccupiedError(input.centreId, input.bedLabel.trim());
    }
    const active = await this.repository.listActiveByCentre(input.tenantId, input.centreId);
    if (active.length >= centre.sickBayCapacity) {
      throw new SickBayFullError(input.centreId);
    }
    const admission = admitToSickBay({ ...input, organizationId: centre.organizationId });
    await this.repository.save(admission);
    await this.emit(admissionOpened(admission));
    return admission;
  }

  async discharge(tenantId: TenantId, id: Uuid, dischargedOn: string): Promise<SickBayAdmission> {
    const updated = dischargeFromSickBay(await this.require(tenantId, id), dischargedOn);
    await this.repository.save(updated);
    await this.emit(admissionDischarged(updated));
    return updated;
  }

  async occupancy(tenantId: TenantId, centreId: Uuid): Promise<BayOccupancy> {
    const centre = await this.centres.findById(tenantId, centreId);
    if (!centre) {
      throw new HealthCentreNotFoundError(centreId);
    }
    const active = await this.repository.listActiveByCentre(tenantId, centreId);
    return computeBayOccupancy(centre.sickBayCapacity, active.length);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<SickBayAdmission> {
    return this.require(tenantId, id);
  }

  async listForPatient(tenantId: TenantId, patientId: Uuid): Promise<SickBayAdmission[]> {
    return this.repository.listByPatient(tenantId, patientId);
  }

  async listForCentre(tenantId: TenantId, centreId: Uuid): Promise<SickBayAdmission[]> {
    return this.repository.listByCentre(tenantId, centreId);
  }

  async listActiveForCentre(tenantId: TenantId, centreId: Uuid): Promise<SickBayAdmission[]> {
    return this.repository.listActiveByCentre(tenantId, centreId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<SickBayAdmission[]> {
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

  private async require(tenantId: TenantId, id: Uuid): Promise<SickBayAdmission> {
    const admission = await this.repository.findById(tenantId, id);
    if (!admission) {
      throw new AdmissionNotFoundError(id);
    }
    return admission;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
