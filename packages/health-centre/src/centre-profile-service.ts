import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import {
  type CentreProfile,
  type CentreProfileCounts,
  createCentreProfile,
  refreshCentreProfile,
} from "./centre-profile";
import { CentreProfileNotFoundError, HealthCentreNotFoundError } from "./errors";
import { centreProfileRefreshed } from "./health-centre-events";
import type { ClinicalOccupancySummary } from "./health-centre-view";
import { computeBayOccupancy, summarizeClinicalOccupancy } from "./occupancy";
import { computeMedicationSchedule } from "./medication-schedule";
import type {
  AdmissionRepository,
  AppointmentRepository,
  CentreProfileRepository,
  EncounterRepository,
  HealthCentreRepository,
  PrescriptionRepository,
  ReferralRepository,
} from "./ports";

export interface CentreProfileServiceDeps {
  readonly repository: CentreProfileRepository;
  readonly centres: HealthCentreRepository;
  readonly admissions: AdmissionRepository;
  readonly appointments: AppointmentRepository;
  readonly encounters: EncounterRepository;
  readonly prescriptions: PrescriptionRepository;
  readonly referrals: ReferralRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * Application service for the health-centre profile — the descriptive read model of a centre's sick-bay
 * occupancy and clinical workload. `refresh` reconciles the sick-bay occupancy (via the pure occupancy
 * engine over active admissions against capacity), the overdue-medication count (via the pure
 * medication-schedule engine over active prescriptions), and the open appointment/encounter/referral and
 * active-prescription counts, then creates or version-bumps the one-per-centre profile. `summarize` rolls
 * the tenant's centres into the institution occupancy picture via the rollup engine. Descriptive only —
 * never a forecast (P2-D28).
 */
export class CentreProfileService {
  private readonly repository: CentreProfileRepository;
  private readonly centres: HealthCentreRepository;
  private readonly admissions: AdmissionRepository;
  private readonly appointments: AppointmentRepository;
  private readonly encounters: EncounterRepository;
  private readonly prescriptions: PrescriptionRepository;
  private readonly referrals: ReferralRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: CentreProfileServiceDeps) {
    this.repository = deps.repository;
    this.centres = deps.centres;
    this.admissions = deps.admissions;
    this.appointments = deps.appointments;
    this.encounters = deps.encounters;
    this.prescriptions = deps.prescriptions;
    this.referrals = deps.referrals;
    this.events = deps.events;
  }

  async refresh(tenantId: TenantId, centreId: Uuid, asOfDate: string): Promise<CentreProfile> {
    const centre = await this.centres.findById(tenantId, centreId);
    if (!centre) {
      throw new HealthCentreNotFoundError(centreId);
    }
    const activeAdmissions = await this.admissions.listActiveByCentre(tenantId, centreId);
    const occupancy = computeBayOccupancy(centre.sickBayCapacity, activeAdmissions.length);
    const openAppointments = await this.appointments.listOpenByCentre(tenantId, centreId);
    const openEncounters = await this.encounters.listOpenByCentre(tenantId, centreId);
    const activePrescriptions = await this.prescriptions.listActiveByCentre(tenantId, centreId);
    const overduePrescriptions = activePrescriptions.filter(
      (p) =>
        computeMedicationSchedule(
          p.startDate,
          p.frequencyPerDay,
          p.durationDays,
          p.dosesAdministered,
          asOfDate,
        ).overdueDoses > 0,
    );
    const openReferrals = await this.referrals.listOpenByCentre(tenantId, centreId);

    const counts: CentreProfileCounts = {
      sickBayCapacity: centre.sickBayCapacity,
      activeAdmissionCount: activeAdmissions.length,
      bedsAvailable: occupancy.bedsAvailable,
      occupancyPercent: occupancy.occupancyPercent,
      overCapacity: occupancy.overCapacity,
      openAppointmentCount: openAppointments.length,
      openEncounterCount: openEncounters.length,
      activePrescriptionCount: activePrescriptions.length,
      overduePrescriptionCount: overduePrescriptions.length,
      openReferralCount: openReferrals.length,
    };

    const existing = await this.repository.findByCentre(tenantId, centreId);
    const profile = existing
      ? refreshCentreProfile(existing, counts)
      : createCentreProfile({
          tenantId,
          organizationId: centre.organizationId,
          centreId,
          centreCode: centre.code,
          counts,
        });
    await this.repository.save(profile);
    await this.emit(centreProfileRefreshed(profile));
    return profile;
  }

  /** Roll the tenant's centres into the institution-wide sick-bay occupancy picture. */
  async summarize(tenantId: TenantId): Promise<ClinicalOccupancySummary> {
    const centres = await this.centres.listByTenant(tenantId);
    const views = await Promise.all(
      centres.map(async (centre) => {
        const active = await this.admissions.listActiveByCentre(tenantId, centre.id);
        return {
          bedCapacity: centre.sickBayCapacity,
          occupantCount: active.length,
          overCapacity: active.length > centre.sickBayCapacity,
        };
      }),
    );
    return summarizeClinicalOccupancy(views);
  }

  async getById(tenantId: TenantId, id: Uuid): Promise<CentreProfile> {
    const profile = await this.repository.findById(tenantId, id);
    if (!profile) {
      throw new CentreProfileNotFoundError(id);
    }
    return profile;
  }

  async getForCentre(tenantId: TenantId, centreId: Uuid): Promise<CentreProfile | null> {
    return this.repository.findByCentre(tenantId, centreId);
  }

  async list(tenantId: TenantId): Promise<CentreProfile[]> {
    return this.repository.listByTenant(tenantId);
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
