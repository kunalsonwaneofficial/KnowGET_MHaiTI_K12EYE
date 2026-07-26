import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  acceptReferral,
  cancelReferral,
  completeReferral,
  isReferralOpen,
  raiseReferral,
} from "./referral";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const centreId = "33333333-3333-3333-3333-333333333333" as Uuid;
const patientId = "44444444-4444-4444-4444-444444444444" as Uuid;

const make = () =>
  raiseReferral({
    tenantId,
    organizationId,
    centreId,
    patientId,
    referredTo: "  City Hospital ",
    urgency: "urgent",
    raisedOn: "2026-01-01",
    reason: " suspected fracture ",
  });

describe("Referral aggregate", () => {
  it("raises open, trimming target and reason", () => {
    const r = make();
    expect(r.referredTo).toBe("City Hospital");
    expect(r.reason).toBe("suspected fracture");
    expect(r.status).toBe("raised");
    expect(isReferralOpen(r)).toBe(true);
  });

  it("rejects an empty target", () => {
    expect(() =>
      raiseReferral({
        tenantId,
        organizationId,
        centreId,
        patientId,
        referredTo: " ",
        urgency: "routine",
        raisedOn: "d",
      }),
    ).toThrow(/external target/);
  });

  it("runs raised → accepted → completed and cancels from either open state", () => {
    const r = make();
    const a = acceptReferral(r);
    expect(a.status).toBe("accepted");
    expect(completeReferral(a).status).toBe("completed");
    expect(cancelReferral(r).status).toBe("cancelled");
    expect(cancelReferral(a).status).toBe("cancelled");
  });

  it("guards illegal transitions", () => {
    const done = completeReferral(acceptReferral(make()));
    expect(() => completeReferral(make())).toThrow(/cannot move/); // raised, not accepted
    expect(() => acceptReferral(done)).toThrow(/cannot move/); // terminal
    expect(() => cancelReferral(done)).toThrow(/cannot move/);
  });
});
