import { describe, expect, it } from "vitest";
import { evaluateAccess, summarizeAccessActivity } from "./access";

const zoneId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const activeGranting = {
  status: "active",
  grantedZoneIds: [zoneId],
  expiresOn: null as string | null,
};
const activeZone = { id: zoneId, status: "active" };

describe("evaluateAccess", () => {
  it("grants an active credential that grants an available zone", () => {
    expect(evaluateAccess(activeGranting, activeZone)).toEqual({
      decision: "granted",
      reason: "ok",
    });
  });

  it("denies in priority order — inactive, then expired, then unavailable, then locked, then not-granted", () => {
    // inactive credential wins even when everything else would also fail
    expect(
      evaluateAccess(
        { status: "suspended", grantedZoneIds: [], expiresOn: "2020-01-01" },
        { id: zoneId, status: "decommissioned" },
        "2026-07-01",
      ),
    ).toEqual({ decision: "denied", reason: "credential_inactive" });
    // expired (strictly before the as-of date) beats zone checks
    expect(
      evaluateAccess(
        { status: "active", grantedZoneIds: [zoneId], expiresOn: "2026-06-30" },
        { id: zoneId, status: "locked_down" },
        "2026-07-01",
      ),
    ).toEqual({ decision: "denied", reason: "credential_expired" });
    // decommissioned zone beats locked-down / not-granted
    expect(evaluateAccess(activeGranting, { id: zoneId, status: "decommissioned" })).toEqual({
      decision: "denied",
      reason: "zone_unavailable",
    });
    // locked-down beats not-granted
    expect(evaluateAccess(activeGranting, { id: zoneId, status: "locked_down" })).toEqual({
      decision: "denied",
      reason: "zone_locked_down",
    });
    // zone not in the granted set
    expect(evaluateAccess(activeGranting, { id: "other", status: "active" })).toEqual({
      decision: "denied",
      reason: "zone_not_granted",
    });
  });

  it("grants when the credential expiry is on or after the as-of date", () => {
    expect(
      evaluateAccess(
        { status: "active", grantedZoneIds: [zoneId], expiresOn: "2026-07-01" },
        activeZone,
        "2026-07-01", // expiry today is still valid
      ),
    ).toMatchObject({ decision: "granted" });
  });
});

describe("summarizeAccessActivity", () => {
  it("counts total, granted and denied", () => {
    expect(
      summarizeAccessActivity([
        { decision: "granted" },
        { decision: "denied" },
        { decision: "granted" },
      ]),
    ).toEqual({ total: 3, granted: 2, denied: 1 });
  });
});
