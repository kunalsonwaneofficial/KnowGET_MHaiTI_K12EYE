import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { CirculationPolicyService } from "./circulation-policy-service";
import { InMemoryCirculationPolicyRepository, type OrganizationDirectory } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir = (known = true): OrganizationDirectory => ({
  async exists() {
    return known;
  },
});

const setup = (known = true) => {
  const repository = new InMemoryCirculationPolicyRepository();
  const service = new CirculationPolicyService({ repository, organizations: orgDir(known) });
  return { repository, service };
};

const draftInput = {
  tenantId,
  organizationId,
  name: "Default",
  defaultRule: { loanPeriodDays: 14, borrowingLimit: 3, renewalLimit: 1, holdShelfDays: 3 },
  rules: [
    {
      category: "faculty" as const,
      loanPeriodDays: 30,
      borrowingLimit: 10,
      renewalLimit: 3,
      holdShelfDays: 7,
    },
  ],
};

describe("CirculationPolicyService", () => {
  it("drafts and rejects an unknown org", async () => {
    expect((await setup().service.draft(draftInput)).status).toBe("draft");
    await expect(setup(false).service.draft(draftInput)).rejects.toThrow(/Organization/);
  });

  it("enforces one active policy per org", async () => {
    const { service } = setup();
    const first = await service.draft(draftInput);
    const second = await service.draft({ ...draftInput, name: "Alt" });
    await service.activate(tenantId, first.id);
    await expect(service.activate(tenantId, second.id)).rejects.toThrow(/already has an active/);
  });

  it("resolves loan terms from the active policy by category", async () => {
    const { service } = setup();
    const p = await service.draft(draftInput);
    await service.activate(tenantId, p.id);
    expect(
      (await service.resolveTermsForMember(tenantId, organizationId, "faculty")).loanPeriodDays,
    ).toBe(30);
    expect(
      (await service.resolveTermsForMember(tenantId, organizationId, "student")).loanPeriodDays,
    ).toBe(14);
  });

  it("throws when there is no active policy to resolve", async () => {
    const { service } = setup();
    await service.draft(draftInput); // drafted but not active
    await expect(
      service.resolveTermsForMember(tenantId, organizationId, "student"),
    ).rejects.toThrow(/not found/);
  });
});
