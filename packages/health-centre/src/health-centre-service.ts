import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isClinicianActive } from "./clinician";
import {
  ClinicianNotActiveError,
  ClinicianNotFoundError,
  DuplicateCentreCodeError,
  HealthCentreNotFoundError,
  OrganizationNotFoundForHealthCentreError,
} from "./errors";
import {
  assignLeadClinician,
  decommissionCentre,
  type HealthCentre,
  type RegisterHealthCentreParams,
  registerHealthCentre,
  renameHealthCentre,
  returnCentreFromMaintenance,
  sendCentreToMaintenance,
  setSickBayCapacity,
  unassignLeadClinician,
} from "./health-centre";
import {
  centreCapacitySet,
  centreDecommissioned,
  centreLeadAssigned,
  centreLeadUnassigned,
  centreRegistered,
  centreRenamed,
  centreReturnedFromMaintenance,
  centreSentToMaintenance,
} from "./health-centre-events";
import type { ClinicianRepository, HealthCentreRepository, OrganizationDirectory } from "./ports";

export interface HealthCentreServiceDeps {
  readonly repository: HealthCentreRepository;
  readonly organizations: OrganizationDirectory;
  readonly clinicians: ClinicianRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for health centres — the clinical facility master. Registers a centre (validating
 * the organization and a unique code), renames it, sets its sick-bay capacity, assigns/clears a lead
 * clinician (validating the clinician is active), and drives the `active ↔ under_maintenance` /
 * `→ decommissioned` lifecycle, publishing the centre events.
 */
export class HealthCentreService {
  private readonly repository: HealthCentreRepository;
  private readonly organizations: OrganizationDirectory;
  private readonly clinicians: ClinicianRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: HealthCentreServiceDeps) {
    this.repository = deps.repository;
    this.organizations = deps.organizations;
    this.clinicians = deps.clinicians;
    this.events = deps.events;
  }

  async create(input: RegisterHealthCentreParams): Promise<HealthCentre> {
    if (!(await this.organizations.exists(input.tenantId, input.organizationId))) {
      throw new OrganizationNotFoundForHealthCentreError(input.organizationId);
    }
    if (await this.repository.findByCode(input.tenantId, input.code.trim())) {
      throw new DuplicateCentreCodeError(input.code.trim());
    }
    const centre = registerHealthCentre(input);
    await this.repository.save(centre);
    await this.emit(centreRegistered(centre));
    return centre;
  }

  async rename(tenantId: TenantId, id: Uuid, name: string): Promise<HealthCentre> {
    const updated = renameHealthCentre(await this.require(tenantId, id), name);
    await this.repository.save(updated);
    await this.emit(centreRenamed(updated));
    return updated;
  }

  async setCapacity(tenantId: TenantId, id: Uuid, capacity: number): Promise<HealthCentre> {
    const updated = setSickBayCapacity(await this.require(tenantId, id), capacity);
    await this.repository.save(updated);
    await this.emit(centreCapacitySet(updated));
    return updated;
  }

  async assignLead(tenantId: TenantId, id: Uuid, clinicianId: Uuid): Promise<HealthCentre> {
    const clinician = await this.clinicians.findById(tenantId, clinicianId);
    if (!clinician) {
      throw new ClinicianNotFoundError(clinicianId);
    }
    if (!isClinicianActive(clinician)) {
      throw new ClinicianNotActiveError(clinicianId);
    }
    const updated = assignLeadClinician(await this.require(tenantId, id), clinicianId);
    await this.repository.save(updated);
    await this.emit(centreLeadAssigned(updated));
    return updated;
  }

  async unassignLead(tenantId: TenantId, id: Uuid): Promise<HealthCentre> {
    const updated = unassignLeadClinician(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(centreLeadUnassigned(updated));
    return updated;
  }

  async sendToMaintenance(tenantId: TenantId, id: Uuid): Promise<HealthCentre> {
    const updated = sendCentreToMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(centreSentToMaintenance(updated));
    return updated;
  }

  async returnFromMaintenance(tenantId: TenantId, id: Uuid): Promise<HealthCentre> {
    const updated = returnCentreFromMaintenance(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(centreReturnedFromMaintenance(updated));
    return updated;
  }

  async decommission(tenantId: TenantId, id: Uuid): Promise<HealthCentre> {
    const updated = decommissionCentre(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(centreDecommissioned(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<HealthCentre> {
    return this.require(tenantId, id);
  }

  async getByCode(tenantId: TenantId, code: string): Promise<HealthCentre> {
    const centre = await this.repository.findByCode(tenantId, code);
    if (!centre) {
      throw new HealthCentreNotFoundError(code);
    }
    return centre;
  }

  async list(tenantId: TenantId): Promise<HealthCentre[]> {
    return this.repository.listByTenant(tenantId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<HealthCentre[]> {
    return this.repository.listByOrganization(tenantId, organizationId);
  }

  private async require(tenantId: TenantId, id: Uuid): Promise<HealthCentre> {
    const centre = await this.repository.findById(tenantId, id);
    if (!centre) {
      throw new HealthCentreNotFoundError(id);
    }
    return centre;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
