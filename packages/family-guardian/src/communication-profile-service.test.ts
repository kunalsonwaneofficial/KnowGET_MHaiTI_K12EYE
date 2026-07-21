import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { CommunicationProfileService } from "./communication-profile-service";
import { DuplicateCommunicationProfileError, FamilyNotFoundError } from "./errors";
import { registerFamily } from "./family";
import { InMemoryCommunicationProfileRepository, InMemoryFamilyRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

async function setup(): Promise<{ svc: CommunicationProfileService; familyId: Uuid }> {
  const familyRepo = new InMemoryFamilyRepository();
  const family = registerFamily({
    tenantId: TENANT,
    organizationId: ORG,
    familyNumber: "FAM-1",
    name: "The Rao Family",
  });
  await familyRepo.save(family);
  const svc = new CommunicationProfileService({
    repository: new InMemoryCommunicationProfileRepository(),
    families: familyRepo,
  });
  return { svc, familyId: family.id };
}

describe("CommunicationProfileService", () => {
  it("creates one profile per family, deriving the organization", async () => {
    const { svc, familyId } = await setup();
    const p = await svc.create({ tenantId: TENANT, familyId, preferredLanguage: "en" });
    expect(p.organizationId).toBe(ORG);
    expect(p.preferredLanguage).toBe("en");
    expect(await svc.getByFamily(TENANT, familyId)).toMatchObject({ id: p.id });
    expect(await svc.listForOrganization(TENANT, ORG)).toHaveLength(1);
  });

  it("rejects an unknown family and a duplicate profile", async () => {
    const { svc, familyId } = await setup();
    await expect(svc.create({ tenantId: TENANT, familyId: UNKNOWN })).rejects.toBeInstanceOf(
      FamilyNotFoundError,
    );
    await svc.create({ tenantId: TENANT, familyId });
    await expect(svc.create({ tenantId: TENANT, familyId })).rejects.toBeInstanceOf(
      DuplicateCommunicationProfileError,
    );
  });

  it("updates schedules and notification preferences through the service", async () => {
    const { svc, familyId } = await setup();
    const p = await svc.create({ tenantId: TENANT, familyId });
    const withSchedule = await svc.putSchedule(TENANT, p.id, {
      label: "mornings",
      days: ["monday"],
      fromTime: "08:00",
      toTime: "10:00",
    });
    expect(withSchedule.schedules).toHaveLength(1);
    const withPref = await svc.setNotificationPreference(TENANT, p.id, "fees", "high");
    expect(withPref.notificationPreferences).toEqual([{ category: "fees", level: "high" }]);
  });
});
