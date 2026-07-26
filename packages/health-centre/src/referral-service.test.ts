import { describe, expect, it } from "vitest";
import type { DomainEvent, TenantId, Uuid } from "@knowget/types";
import { registerHealthCentre } from "./health-centre";
import {
  InMemoryClinicianRepository,
  InMemoryHealthCentreRepository,
  InMemoryReferralRepository,
  type PersonDirectory,
} from "./ports";
import { ReferralService } from "./referral-service";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;

const personDir = (known = true): PersonDirectory => ({
  async exists() {
    return known;
  },
});

const setup = async (patientKnown = true) => {
  const repository = new InMemoryReferralRepository();
  const centres = new InMemoryHealthCentreRepository();
  const events: DomainEvent[] = [];
  const centre = registerHealthCentre({
    tenantId,
    organizationId,
    code: "HC-1",
    name: "Infirmary",
    type: "infirmary",
  });
  await centres.save(centre);
  const service = new ReferralService({
    repository,
    centres,
    persons: personDir(patientKnown),
    clinicians: new InMemoryClinicianRepository(),
    events: {
      async publish(e: DomainEvent) {
        events.push(e);
      },
    },
  });
  return { service, centre, events };
};

describe("ReferralService", () => {
  it("raises, accepts and completes a referral, deriving the org and emitting content-free events", async () => {
    const { service, centre, events } = await setup();
    const r = await service.raise({
      tenantId,
      centreId: centre.id,
      patientId,
      referredTo: "City Hospital",
      urgency: "urgent",
      raisedOn: "2026-01-02",
      reason: "suspected fracture",
    });
    expect(r.organizationId).toBe(organizationId);
    await service.accept(tenantId, r.id);
    expect((await service.complete(tenantId, r.id)).status).toBe("completed");
    const raised = events.find((e) => e.type === "clinical.referral.raised");
    expect(JSON.stringify(raised?.payload)).not.toContain("fracture");
    expect(JSON.stringify(raised?.payload)).not.toContain("City Hospital");
  });

  it("rejects an unknown patient", async () => {
    const { service, centre } = await setup(false);
    await expect(
      service.raise({
        tenantId,
        centreId: centre.id,
        patientId,
        referredTo: "X",
        urgency: "routine",
        raisedOn: "d",
      }),
    ).rejects.toThrow(/Person/);
  });
});
