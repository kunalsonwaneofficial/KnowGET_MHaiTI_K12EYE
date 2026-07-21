import type { TenantId, Uuid } from "@knowget/types";
import { describe, expect, it } from "vitest";
import { DuplicateFamilyIntelligenceProfileError, FamilyNotFoundError } from "./errors";
import { registerFamily } from "./family";
import { FamilyIntelligenceProfileService } from "./family-intelligence-profile-service";
import { InMemoryFamilyIntelligenceProfileRepository, InMemoryFamilyRepository } from "./ports";

const TENANT = "11111111-1111-1111-1111-111111111111" as TenantId;
const ORG = "22222222-2222-2222-2222-222222222222" as Uuid;
const UNKNOWN = "99999999-9999-9999-9999-999999999999" as Uuid;

async function setup(): Promise<{ svc: FamilyIntelligenceProfileService; familyId: Uuid }> {
  const familyRepo = new InMemoryFamilyRepository();
  const family = registerFamily({
    tenantId: TENANT,
    organizationId: ORG,
    familyNumber: "FAM-1",
    name: "The Rao Family",
  });
  await familyRepo.save(family);
  const svc = new FamilyIntelligenceProfileService({
    repository: new InMemoryFamilyIntelligenceProfileRepository(),
    families: familyRepo,
  });
  return { svc, familyId: family.id };
}

describe("FamilyIntelligenceProfileService", () => {
  it("creates one profile per family, deriving the organization", async () => {
    const { svc, familyId } = await setup();
    const p = await svc.create({ tenantId: TENANT, familyId });
    expect(p.organizationId).toBe(ORG);
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
      DuplicateFamilyIntelligenceProfileError,
    );
  });

  it("updates indicators and records interactions through the service", async () => {
    const { svc, familyId } = await setup();
    const p = await svc.create({ tenantId: TENANT, familyId });
    const withIndicators = await svc.updateIndicators(TENANT, p.id, {
      engagementLevel: "moderate",
      consentCompliance: "compliant",
    });
    expect(withIndicators.indicators.engagementLevel).toBe("moderate");
    const withInteraction = await svc.recordInteraction(TENANT, p.id, {
      kind: "event_attendance",
      summary: "attended open day",
    });
    expect(withInteraction.interactions).toHaveLength(1);
  });
});
