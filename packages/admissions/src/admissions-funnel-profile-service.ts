import type { EventBus } from "@knowget/events";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import type { AdmissionCycle } from "./admission-cycle";
import {
  type AdmissionsFunnelProfile,
  createAdmissionsFunnelProfile,
  refreshAdmissionsFunnelProfile,
} from "./admissions-funnel-profile";
import type {
  AdmissionFunnel,
  FunnelCountsView,
  GradeIntakeCapacity,
  GradeIntakeView,
} from "./admissions-view";
import { funnelProfileRefreshed } from "./admissions-events";
import { CycleNotFoundError } from "./errors";
import { computeAdmissionFunnel } from "./funnel";
import { computeIntakeCapacity, summarizeIntake } from "./intake";
import type {
  AdmissionCycleRepository,
  AdmissionsFunnelProfileRepository,
  ApplicationRepository,
  EnrollmentConfirmationRepository,
  LeadRepository,
  OfferRepository,
} from "./ports";

export interface AdmissionsFunnelProfileServiceDeps {
  readonly profiles: AdmissionsFunnelProfileRepository;
  readonly cycles: AdmissionCycleRepository;
  readonly leads: LeadRepository;
  readonly applications: ApplicationRepository;
  readonly offers: OfferRepository;
  readonly enrollments: EnrollmentConfirmationRepository;
  readonly events?: Pick<EventBus, "publish">;
}

/**
 * The admissions funnel-profile refresh spine — the composition root that rolls the domain's aggregates
 * through the two pure engines. It reads the organization's lead volume and the cycle's application, offer and
 * enrollment counts, values the funnel with `computeAdmissionFunnel`, and values the cycle's per-grade seat
 * plan against confirmed enrolments with `computeIntakeCapacity` / `summarizeIntake`. `refreshForCycle` upserts
 * the derived per-cycle profile and publishes `admissions.funnel_profile.refreshed`; the read helpers derive
 * the same numbers on demand without persisting. The engines stay pure — this spine does only the wiring.
 *
 * The intake picture reflects the declared seat plan only: an enrolment for a grade absent from the plan is
 * counted in the funnel's enrollment total but not attributed to any seat capacity, so a cycle's intake
 * `totalConfirmed` may trail its funnel `enrollmentCount` by design.
 */
export class AdmissionsFunnelProfileService {
  private readonly profiles: AdmissionsFunnelProfileRepository;
  private readonly cycles: AdmissionCycleRepository;
  private readonly leads: LeadRepository;
  private readonly applications: ApplicationRepository;
  private readonly offers: OfferRepository;
  private readonly enrollments: EnrollmentConfirmationRepository;
  private readonly events: Pick<EventBus, "publish"> | undefined;

  constructor(deps: AdmissionsFunnelProfileServiceDeps) {
    this.profiles = deps.profiles;
    this.cycles = deps.cycles;
    this.leads = deps.leads;
    this.applications = deps.applications;
    this.offers = deps.offers;
    this.enrollments = deps.enrollments;
    this.events = deps.events;
  }

  /** Recompute and persist the per-cycle funnel profile from the underlying aggregates. */
  async refreshForCycle(tenantId: TenantId, cycleId: Uuid): Promise<AdmissionsFunnelProfile> {
    const cycle = await this.requireCycle(tenantId, cycleId);
    const funnel = computeAdmissionFunnel(await this.funnelCounts(tenantId, cycle));
    const intake = summarizeIntake(await this.gradeIntakeViews(tenantId, cycle));
    const base =
      (await this.profiles.findByCycle(tenantId, cycleId)) ??
      createAdmissionsFunnelProfile({
        tenantId,
        organizationId: cycle.organizationId,
        cycleId,
      });
    const refreshed = refreshAdmissionsFunnelProfile(base, { funnel, intake });
    await this.profiles.save(refreshed);
    await this.emit(funnelProfileRefreshed(refreshed));
    return refreshed;
  }

  /** The live funnel for a cycle — derived on read, never stored as truth. */
  async funnelForCycle(tenantId: TenantId, cycleId: Uuid): Promise<AdmissionFunnel> {
    const cycle = await this.requireCycle(tenantId, cycleId);
    return computeAdmissionFunnel(await this.funnelCounts(tenantId, cycle));
  }

  /** The live per-grade intake for a cycle — declared capacity vs confirmed enrolments, derived on read. */
  async intakeByGrade(tenantId: TenantId, cycleId: Uuid): Promise<GradeIntakeCapacity[]> {
    const cycle = await this.requireCycle(tenantId, cycleId);
    const confirmed = await this.confirmedByGrade(tenantId, cycleId);
    return cycle.gradeCapacities.map((gc) => ({
      grade: gc.grade,
      ...computeIntakeCapacity(gc.capacity, confirmed.get(gc.grade) ?? 0),
    }));
  }

  /** The stored funnel profile for a cycle, if one has been refreshed. */
  async getForCycle(tenantId: TenantId, cycleId: Uuid): Promise<AdmissionsFunnelProfile | null> {
    return this.profiles.findByCycle(tenantId, cycleId);
  }

  private async funnelCounts(tenantId: TenantId, cycle: AdmissionCycle): Promise<FunnelCountsView> {
    const [leadCount, applicationCount, offerCount, enrollmentCount] = await Promise.all([
      this.leads.countByOrganization(tenantId, cycle.organizationId),
      this.applications.countByCycle(tenantId, cycle.id),
      this.offers.countByCycle(tenantId, cycle.id),
      this.enrollments.countByCycle(tenantId, cycle.id),
    ]);
    return { leadCount, applicationCount, offerCount, enrollmentCount };
  }

  private async gradeIntakeViews(
    tenantId: TenantId,
    cycle: AdmissionCycle,
  ): Promise<GradeIntakeView[]> {
    const confirmed = await this.confirmedByGrade(tenantId, cycle.id);
    return cycle.gradeCapacities.map((gc) => ({
      capacity: gc.capacity,
      confirmedCount: confirmed.get(gc.grade) ?? 0,
    }));
  }

  private async confirmedByGrade(tenantId: TenantId, cycleId: Uuid): Promise<Map<string, number>> {
    const confirmations = await this.enrollments.listByCycle(tenantId, cycleId);
    const byGrade = new Map<string, number>();
    for (const confirmation of confirmations) {
      byGrade.set(confirmation.gradeConfirmed, (byGrade.get(confirmation.gradeConfirmed) ?? 0) + 1);
    }
    return byGrade;
  }

  private async requireCycle(tenantId: TenantId, cycleId: Uuid): Promise<AdmissionCycle> {
    const cycle = await this.cycles.findById(tenantId, cycleId);
    if (!cycle) {
      throw new CycleNotFoundError(cycleId);
    }
    return cycle;
  }

  private async emit(event: DomainEvent): Promise<void> {
    if (this.events) {
      await this.events.publish(event);
    }
  }
}
