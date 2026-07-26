import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { DigitalAssetService } from "./digital-asset-service";
import { InMemoryDigitalAssetRepository, type OrganizationDirectory } from "./ports";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const orgDir = (known = true): OrganizationDirectory => ({
  async exists() {
    return known;
  },
});

const setup = (known = true) => {
  const repository = new InMemoryDigitalAssetRepository();
  const service = new DigitalAssetService({ repository, organizations: orgDir(known) });
  return { repository, service };
};

const input = {
  tenantId,
  organizationId,
  title: "Intro to CS",
  format: "ebook" as const,
  accessModel: "licensed" as const,
};

describe("DigitalAssetService", () => {
  it("catalogs when the org exists and rejects an unknown org", async () => {
    const { service } = setup();
    expect((await service.catalog(input)).status).toBe("active");
    await expect(setup(false).service.catalog(input)).rejects.toThrow(/Organization/);
  });

  it("drives retire/reactivate and licence renewal", async () => {
    const { service } = setup();
    const a = await service.catalog(input);
    expect((await service.retire(tenantId, a.id)).status).toBe("retired");
    expect((await service.reactivate(tenantId, a.id)).status).toBe("active");
    expect((await service.renewLicense(tenantId, a.id, "2028-01-01")).licenseExpiry).toBe(
      "2028-01-01",
    );
  });
});
