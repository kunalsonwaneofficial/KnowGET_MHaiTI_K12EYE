import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { contactLead, convertLead, createLead, loseLead, qualifyLead } from "./lead";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;

const make = () =>
  createLead({
    tenantId,
    organizationId,
    code: "LEAD-1",
    contactName: "Asha Rao",
    source: "referral",
  });

describe("Lead", () => {
  it("creates new and runs new → contacted → qualified → converted", () => {
    let l = make();
    expect(l.status).toBe("new");
    l = contactLead(l);
    expect(l.status).toBe("contacted");
    l = qualifyLead(l);
    expect(l.status).toBe("qualified");
    l = convertLead(l);
    expect(l.status).toBe("converted");
  });

  it("loses an open lead (terminal) and rejects further transitions", () => {
    const lost = loseLead(make());
    expect(lost.status).toBe("lost");
    expect(() => contactLead(lost)).toThrow(/cannot move/);
    expect(() => loseLead(lost)).toThrow(/cannot move/);
    // cannot convert a lead that was never qualified
    expect(() => convertLead(make())).toThrow(/cannot move/);
  });

  it("rejects an empty code or contact name", () => {
    expect(() =>
      createLead({ tenantId, organizationId, code: " ", contactName: "x", source: "event" }),
    ).toThrow(/code/);
    expect(() =>
      createLead({ tenantId, organizationId, code: "c", contactName: " ", source: "event" }),
    ).toThrow(/contact name/);
  });
});
