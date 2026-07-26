import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { AdmissionsFunnelProfileService } from "./admissions-funnel-profile-service";
import { createAdmissionCycle } from "./admission-cycle";
import { createApplication } from "./application";
import { confirmEnrollment } from "./enrollment-confirmation";
import { createLead } from "./lead";
import { extendOffer } from "./offer";
import {
  InMemoryAdmissionCycleRepository,
  InMemoryAdmissionsFunnelProfileRepository,
  InMemoryApplicationRepository,
  InMemoryEnrollmentConfirmationRepository,
  InMemoryLeadRepository,
  InMemoryOfferRepository,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const applicantPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;

const setup = async () => {
  const profiles = new InMemoryAdmissionsFunnelProfileRepository();
  const cycles = new InMemoryAdmissionCycleRepository();
  const leads = new InMemoryLeadRepository();
  const applications = new InMemoryApplicationRepository();
  const offers = new InMemoryOfferRepository();
  const enrollments = new InMemoryEnrollmentConfirmationRepository();
  const events: DomainEvent[] = [];

  const cycle = createAdmissionCycle({
    tenantId,
    organizationId,
    code: "AY27",
    name: "2027 Intake",
    academicYear: "2027-28",
    gradeCapacities: [
      { grade: "G1", capacity: 2 },
      { grade: "G2", capacity: 1 },
    ],
  });
  await cycles.save(cycle);

  // Three organization-level leads (top of funnel).
  for (const code of ["L1", "L2", "L3"]) {
    await leads.save(
      createLead({ tenantId, organizationId, code, contactName: "Family", source: "referral" }),
    );
  }

  // Two applications in the cycle, one per grade; an offer for each; one confirmed enrollment (G1).
  const specs = [
    { code: "A1", grade: "G1" },
    { code: "A2", grade: "G2" },
  ];
  let enrolOfferId: Uuid | null = null;
  let enrolApplicationId: Uuid | null = null;
  for (const spec of specs) {
    const application = createApplication({
      tenantId,
      organizationId,
      cycleId: cycle.id,
      applicantPersonId,
      code: spec.code,
      gradeApplyingFor: spec.grade,
      submittedOn: "2026-11-01",
    });
    await applications.save(application);
    const offer = extendOffer({
      tenantId,
      organizationId,
      applicationId: application.id,
      cycleId: cycle.id,
      gradeOffered: spec.grade,
      extendedOn: "2026-12-02",
    });
    await offers.save(offer);
    if (spec.grade === "G1") {
      enrolOfferId = offer.id;
      enrolApplicationId = application.id;
    }
  }
  await enrollments.save(
    confirmEnrollment({
      tenantId,
      organizationId,
      offerId: enrolOfferId!,
      applicationId: enrolApplicationId!,
      cycleId: cycle.id,
      applicantPersonId,
      gradeConfirmed: "G1",
      confirmedOn: "2026-12-20",
    }),
  );

  const service = new AdmissionsFunnelProfileService({
    profiles,
    cycles,
    leads,
    applications,
    offers,
    enrollments,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { service, cycle, profiles, events };
};

describe("AdmissionsFunnelProfileService", () => {
  it("refreshes a per-cycle profile by rolling the aggregates through both pure engines", async () => {
    const { service, cycle, profiles, events } = await setup();
    const profile = await service.refreshForCycle(tenantId, cycle.id);

    expect(profile.leadCount).toBe(3);
    expect(profile.applicationCount).toBe(2);
    expect(profile.offerCount).toBe(2);
    expect(profile.enrollmentCount).toBe(1);
    expect(profile.leadToApplicationPercent).toBe(67);
    expect(profile.applicationToOfferPercent).toBe(100);
    expect(profile.offerToEnrollmentPercent).toBe(50);
    expect(profile.overallConversionPercent).toBe(33);
    expect(profile.gradeCount).toBe(2);
    expect(profile.totalCapacity).toBe(3);
    expect(profile.totalConfirmed).toBe(1);
    expect(profile.fillPercent).toBe(33);

    // Persisted, and one profile per cycle — a second refresh upserts in place.
    const stored = await service.getForCycle(tenantId, cycle.id);
    expect(stored?.id).toBe(profile.id);
    const again = await service.refreshForCycle(tenantId, cycle.id);
    expect(again.id).toBe(profile.id);
    expect((await profiles.listByTenant(tenantId)).length).toBe(1);

    expect(events.map((e) => e.type)).toContain("admissions.funnel_profile.refreshed");
  });

  it("derives the live funnel and per-grade intake without persisting", async () => {
    const { service, cycle, profiles } = await setup();

    const funnel = await service.funnelForCycle(tenantId, cycle.id);
    expect(funnel.applicationToOfferPercent).toBe(100);
    expect(funnel.enrollmentCount).toBe(1);

    const intake = await service.intakeByGrade(tenantId, cycle.id);
    const g1 = intake.find((g) => g.grade === "G1");
    const g2 = intake.find((g) => g.grade === "G2");
    expect(g1).toMatchObject({
      capacity: 2,
      confirmedCount: 1,
      remaining: 1,
      overSubscribed: false,
      fillPercent: 50,
    });
    expect(g2).toMatchObject({
      capacity: 1,
      confirmedCount: 0,
      remaining: 1,
      overSubscribed: false,
      fillPercent: 0,
    });

    // The read helpers derive on demand — nothing is written.
    expect(await service.getForCycle(tenantId, cycle.id)).toBeNull();
    expect((await profiles.listByTenant(tenantId)).length).toBe(0);
  });

  it("throws for an unknown cycle", async () => {
    const { service } = await setup();
    await expect(
      service.refreshForCycle(tenantId, "00000000-0000-0000-0000-000000000000" as Uuid),
    ).rejects.toThrow(/not found/);
  });
});
