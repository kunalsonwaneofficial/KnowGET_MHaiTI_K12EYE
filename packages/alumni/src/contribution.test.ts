import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { recordContribution } from "./contribution";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const alumniProfileId = "33333333-3333-3333-3333-333333333333" as Uuid;

describe("Contribution", () => {
  it("records an immutable giving fact with a recognition tier and no money field", () => {
    const c = recordContribution({
      tenantId,
      organizationId,
      alumniProfileId,
      type: "gift",
      recognitionTier: "patron",
      contributedOn: "2026-04-01",
      campaignRef: "FUND-27",
    });
    expect(c.id).toBeTruthy();
    expect(c.type).toBe("gift");
    expect(c.recognitionTier).toBe("patron");
    expect(c.campaignRef).toBe("FUND-27");
    expect(c.contributedOn).toBe("2026-04-01");
    expect(c.createdAt).toBe(c.updatedAt);
    expect(Object.keys(c)).not.toContain("amount");
  });

  it("defaults an omitted campaign reference to null", () => {
    const c = recordContribution({
      tenantId,
      organizationId,
      alumniProfileId,
      type: "pledge",
      recognitionTier: "supporter",
      contributedOn: "2026-04-01",
    });
    expect(c.campaignRef).toBeNull();
  });
});
