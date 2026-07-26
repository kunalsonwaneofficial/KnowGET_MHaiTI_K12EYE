import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { isClinicianActive } from "./clinician";
import {
  ClinicianNotActiveError,
  ClinicianNotFoundError,
  HealthCentreNotActiveError,
  HealthCentreNotFoundError,
  PersonNotFoundForHealthCentreError,
  ReferralNotFoundError,
} from "./errors";
import { isHealthCentreActive } from "./health-centre";
import {
  referralAccepted,
  referralCancelled,
  referralCompleted,
  referralRaised,
} from "./health-centre-events";
import type {
  ClinicianRepository,
  HealthCentreRepository,
  PersonDirectory,
  ReferralRepository,
} from "./ports";
import {
  acceptReferral,
  cancelReferral,
  completeReferral,
  type RaiseReferralParams,
  raiseReferral,
  type Referral,
} from "./referral";

/** The raise input — the organization is derived from the centre, not supplied. */
export type RaiseReferralInput = Omit<RaiseReferralParams, "organizationId">;

export interface ReferralServiceDeps {
  readonly repository: ReferralRepository;
  readonly centres: HealthCentreRepository;
  readonly persons: PersonDirectory;
  readonly clinicians: ClinicianRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for referrals. Raises an onward referral from an active centre (deriving the org from
 * the centre, validating the patient exists and any referring clinician is active), and drives the
 * `raised → accepted → completed | cancelled` lifecycle, publishing the content-free referral events.
 */
export class ReferralService {
  private readonly repository: ReferralRepository;
  private readonly centres: HealthCentreRepository;
  private readonly persons: PersonDirectory;
  private readonly clinicians: ClinicianRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: ReferralServiceDeps) {
    this.repository = deps.repository;
    this.centres = deps.centres;
    this.persons = deps.persons;
    this.clinicians = deps.clinicians;
    this.events = deps.events;
  }

  async raise(input: RaiseReferralInput): Promise<Referral> {
    const centre = await this.activeCentre(input.tenantId, input.centreId);
    if (!(await this.persons.exists(input.tenantId, input.patientId))) {
      throw new PersonNotFoundForHealthCentreError(input.patientId);
    }
    if (input.clinicianId) {
      await this.requireActiveClinician(input.tenantId, input.clinicianId);
    }
    const referral = raiseReferral({ ...input, organizationId: centre.organizationId });
    await this.repository.save(referral);
    await this.emit(referralRaised(referral));
    return referral;
  }

  async accept(tenantId: TenantId, id: Uuid): Promise<Referral> {
    const updated = acceptReferral(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(referralAccepted(updated));
    return updated;
  }

  async complete(tenantId: TenantId, id: Uuid): Promise<Referral> {
    const updated = completeReferral(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(referralCompleted(updated));
    return updated;
  }

  async cancel(tenantId: TenantId, id: Uuid): Promise<Referral> {
    const updated = cancelReferral(await this.require(tenantId, id));
    await this.repository.save(updated);
    await this.emit(referralCancelled(updated));
    return updated;
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<Referral> {
    return this.require(tenantId, id);
  }

  async listForPatient(tenantId: TenantId, patientId: Uuid): Promise<Referral[]> {
    return this.repository.listByPatient(tenantId, patientId);
  }

  async listForCentre(tenantId: TenantId, centreId: Uuid): Promise<Referral[]> {
    return this.repository.listByCentre(tenantId, centreId);
  }

  async listOpenForCentre(tenantId: TenantId, centreId: Uuid): Promise<Referral[]> {
    return this.repository.listOpenByCentre(tenantId, centreId);
  }

  async listForOrganization(tenantId: TenantId, organizationId: Uuid): Promise<Referral[]> {
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

  private async require(tenantId: TenantId, id: Uuid): Promise<Referral> {
    const referral = await this.repository.findById(tenantId, id);
    if (!referral) {
      throw new ReferralNotFoundError(id);
    }
    return referral;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
