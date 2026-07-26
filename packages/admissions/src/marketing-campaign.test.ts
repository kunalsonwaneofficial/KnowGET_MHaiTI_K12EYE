import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  activateCampaign,
  cancelCampaign,
  completeCampaign,
  createMarketingCampaign,
  isCampaignActive,
  renameCampaign,
} from "./marketing-campaign";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  createMarketingCampaign({
    tenantId,
    organizationId,
    code: "CMP-1",
    name: "Open Day 2027",
    channel: "event",
  });

describe("MarketingCampaign", () => {
  it("creates draft and runs draft → active → completed", () => {
    let c = make();
    expect(c.status).toBe("draft");
    c = activateCampaign(c);
    expect(isCampaignActive(c)).toBe(true);
    c = completeCampaign(c);
    expect(c.status).toBe("completed");
  });

  it("freezes edits and transitions once terminal", () => {
    const completed = completeCampaign(activateCampaign(make()));
    expect(() => renameCampaign(completed, "x")).toThrow(/cannot move/);
    expect(() => activateCampaign(completed)).toThrow(/cannot move/);
    const cancelled = cancelCampaign(make());
    expect(cancelled.status).toBe("cancelled");
    expect(() => cancelCampaign(cancelled)).toThrow(/cannot move/);
  });

  it("rejects an empty code or name", () => {
    expect(() =>
      createMarketingCampaign({ tenantId, organizationId, code: " ", name: "x", channel: "print" }),
    ).toThrow(/code/);
    expect(() =>
      createMarketingCampaign({ tenantId, organizationId, code: "c", name: " ", channel: "print" }),
    ).toThrow(/name/);
  });
});
