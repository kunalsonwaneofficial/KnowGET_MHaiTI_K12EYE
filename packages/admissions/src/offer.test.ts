import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  acceptOffer,
  declineOffer,
  expireOffer,
  extendOffer,
  isOfferAccepted,
  withdrawOffer,
} from "./offer";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const applicationId = "66666666-6666-6666-6666-666666666666" as Uuid;
const cycleId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  extendOffer({
    tenantId,
    organizationId,
    applicationId,
    cycleId,
    gradeOffered: "G1",
    extendedOn: "2026-12-01",
    respondBy: "2026-12-15",
  });

describe("Offer", () => {
  it("extends and accepts, stamping the response date", () => {
    let o = make();
    expect(o.status).toBe("extended");
    o = acceptOffer(o, "2026-12-10");
    expect(isOfferAccepted(o)).toBe(true);
    expect(o.respondedOn).toBe("2026-12-10");
  });

  it("declines/expires/withdraws only from extended, and freezes once terminal", () => {
    expect(declineOffer(make(), "d").status).toBe("declined");
    expect(expireOffer(make()).status).toBe("expired");
    expect(withdrawOffer(make()).status).toBe("withdrawn");
    const accepted = acceptOffer(make(), "d");
    expect(() => declineOffer(accepted, "d")).toThrow(/cannot move/);
    expect(() => expireOffer(accepted)).toThrow(/cannot move/);
  });
});
