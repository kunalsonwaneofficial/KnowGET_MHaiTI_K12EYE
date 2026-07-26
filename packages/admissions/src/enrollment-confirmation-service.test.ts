import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { EnrollmentConfirmationService } from "./enrollment-confirmation-service";
import { createApplication, offerApplication, startApplicationReview } from "./application";
import { acceptOffer, extendOffer } from "./offer";
import {
  InMemoryApplicationRepository,
  InMemoryEnrollmentConfirmationRepository,
  InMemoryOfferRepository,
} from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const cycleId = "44444444-4444-4444-4444-444444444444" as Uuid;
const applicantPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;

const setup = async (accepted = true) => {
  const repository = new InMemoryEnrollmentConfirmationRepository();
  const offers = new InMemoryOfferRepository();
  const applications = new InMemoryApplicationRepository();
  const events: DomainEvent[] = [];

  const application = offerApplication(
    startApplicationReview(
      createApplication({
        tenantId,
        organizationId,
        cycleId,
        applicantPersonId,
        code: "APP-1",
        gradeApplyingFor: "G1",
        submittedOn: "2026-11-01",
      }),
    ),
    "2026-12-01",
  );
  await applications.save(application);

  let offer = extendOffer({
    tenantId,
    organizationId,
    applicationId: application.id,
    cycleId,
    gradeOffered: "G1",
    extendedOn: "2026-12-02",
  });
  if (accepted) {
    offer = acceptOffer(offer, "2026-12-10");
  }
  await offers.save(offer);

  const service = new EnrollmentConfirmationService({
    repository,
    offers,
    applications,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, offers, applications, service, offer, application, events };
};

describe("EnrollmentConfirmationService", () => {
  it("confirms an enrollment from an accepted offer, deriving cycle/grade/applicant and emitting the event", async () => {
    const { service, offer, events } = await setup();
    const c = await service.confirm({ tenantId, offerId: offer.id, confirmedOn: "2026-12-20" });
    expect(c.cycleId).toBe(cycleId);
    expect(c.gradeConfirmed).toBe("G1");
    expect(c.applicantPersonId).toBe(applicantPersonId);
    expect(c.applicationId).toBe(offer.applicationId);
    expect(c.studentId).toBeNull();
    expect(events.map((e) => e.type)).toContain("admissions.enrollment.confirmed");
  });

  it("rejects a non-accepted offer and a second confirmation for the same offer", async () => {
    const { service: notAccepted, offer: extended } = await setup(false);
    await expect(
      notAccepted.confirm({ tenantId, offerId: extended.id, confirmedOn: "d" }),
    ).rejects.toThrow(/not accepted/);

    const { service, offer } = await setup();
    await service.confirm({ tenantId, offerId: offer.id, confirmedOn: "d" });
    await expect(
      service.confirm({ tenantId, offerId: offer.id, confirmedOn: "d" }),
    ).rejects.toThrow(/already been confirmed/);
  });

  it("rejects confirming from an unknown offer", async () => {
    const { service } = await setup();
    await expect(
      service.confirm({
        tenantId,
        offerId: "00000000-0000-0000-0000-000000000000" as Uuid,
        confirmedOn: "d",
      }),
    ).rejects.toThrow(/not found/);
  });
});
