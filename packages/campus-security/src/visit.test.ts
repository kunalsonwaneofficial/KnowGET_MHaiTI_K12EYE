import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  approveVisit,
  cancelVisit,
  checkInVisit,
  checkOutVisit,
  denyVisit,
  expireVisit,
  isVisitOnSite,
  isVisitOpen,
  requestVisit,
  setVisitZone,
} from "./visit";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const visitorId = "33333333-3333-3333-3333-333333333333" as Uuid;
const hostPersonId = "44444444-4444-4444-4444-444444444444" as Uuid;
const zoneId = "55555555-5555-5555-5555-555555555555" as Uuid;

const make = () =>
  requestVisit({
    tenantId,
    organizationId,
    visitorId,
    hostPersonId,
    zoneId,
    purpose: "  Delivery  ",
    scheduledFor: "2026-07-01T09:00:00.000Z",
  });

describe("Visit aggregate", () => {
  it("requests with a trimmed purpose, open and not on-site", () => {
    const v = make();
    expect(v.status).toBe("requested");
    expect(v.purpose).toBe("Delivery");
    expect(v.checkedInAt).toBeNull();
    expect(isVisitOpen(v)).toBe(true);
    expect(isVisitOnSite(v)).toBe(false);
  });

  it("runs requested → approved → checked_in → checked_out with times", () => {
    const v = make();
    const a = approveVisit(v);
    expect(a.status).toBe("approved");
    const inn = checkInVisit(a, "2026-07-01T09:05:00.000Z");
    expect(inn.status).toBe("checked_in");
    expect(inn.checkedInAt).toBe("2026-07-01T09:05:00.000Z");
    expect(isVisitOnSite(inn)).toBe(true);
    const out = checkOutVisit(inn, "2026-07-01T10:00:00.000Z");
    expect(out.status).toBe("checked_out");
    expect(out.checkedOutAt).toBe("2026-07-01T10:00:00.000Z");
    expect(isVisitOpen(out)).toBe(false);
  });

  it("guards illegal transitions and terminal branches", () => {
    const v = make();
    expect(() => checkInVisit(v, "x")).toThrow(/cannot move/); // requested, not approved
    expect(() => checkOutVisit(v, "x")).toThrow(/cannot move/);
    expect(denyVisit(v).status).toBe("denied");
    expect(() => approveVisit(denyVisit(v))).toThrow(/cannot move/); // denied is terminal
    const approved = approveVisit(v);
    expect(cancelVisit(approved).status).toBe("cancelled");
    expect(expireVisit(v).status).toBe("expired");
    const checkedIn = checkInVisit(approved, "t");
    expect(() => cancelVisit(checkedIn)).toThrow(/cannot move/); // can't cancel once checked in
    expect(() => setVisitZone(checkOutVisit(checkedIn, "t2"), zoneId)).toThrow(/cannot move/); // closed
  });

  it("re-targets the zone while open", () => {
    const v = make();
    expect(setVisitZone(v, null).zoneId).toBeNull();
    expect(setVisitZone(v, "other" as Uuid).zoneId).toBe("other");
  });
});
