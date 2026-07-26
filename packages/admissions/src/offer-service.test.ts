import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { OfferService } from "./offer-service";
import { createApplication, offerApplication, startApplicationReview } from "./application";
import { InMemoryApplicationRepository, InMemoryOfferRepository } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const cycleId = "44444444-4444-4444-4444-444444444444" as Uuid;
const applicantPersonId = "55555555-5555-5555-5555-555555555555" as Uuid;

const buildApplication = (offered: boolean) => {
  let a = createApplication({
    tenantId,
    organizationId,
    cycleId,
    applicantPersonId,
    code: "APP-1",
    gradeApplyingFor: "G1",
    submittedOn: "2026-11-01",
  });
  if (offered) {
    a = offerApplication(startApplicationReview(a), "2026-12-01");
  }
  return a;
};

const setup = async (offered = true) => {
  const repository = new InMemoryOfferRepository();
  const applications = new InMemoryApplicationRepository();
  const events: DomainEvent[] = [];
  const application = buildApplication(offered);
  await applications.save(application);
  const service = new OfferService({
    repository,
    applications,
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { repository, applications, service, application, events };
};

describe("OfferService", () => {
  it("extends an offer for an offered application (deriving grade + cycle) and accepts it", async () => {
    const { service, application, events } = await setup();
    const o = await service.extend({
      tenantId,
      applicationId: application.id,
      extendedOn: "2026-12-02",
      respondBy: "2026-12-16",
    });
    expect(o.gradeOffered).toBe("G1");
    expect(o.cycleId).toBe(cycleId);
    await service.accept(tenantId, o.id, "2026-12-10");
    const types = new Set(events.map((e) => e.type));
    expect(types.has("admissions.offer.extended")).toBe(true);
    expect(types.has("admissions.offer.accepted")).toBe(true);
  });

  it("rejects a non-offered application and a second offer for the same application", async () => {
    const { service: notOffered, application: a1 } = await setup(false);
    await expect(
      notOffered.extend({ tenantId, applicationId: a1.id, extendedOn: "d" }),
    ).rejects.toThrow(/offered state/);

    const { service, application } = await setup();
    await service.extend({ tenantId, applicationId: application.id, extendedOn: "d" });
    await expect(
      service.extend({ tenantId, applicationId: application.id, extendedOn: "d" }),
    ).rejects.toThrow(/already exists/);
  });
});
