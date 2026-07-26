import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import type { AccessActivitySummary, ZonePresence } from "./campus-security-view";
import { composeSafetyProfile, refreshSafetyProfile } from "./safety-profile";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const zoneId = "33333333-3333-3333-3333-333333333333" as Uuid;

const presence = (onSiteCount = 3): ZonePresence => ({
  onSiteCount,
  capacity: 10,
  available: 10 - onSiteCount,
  overCapacity: false,
  occupancyPercent: onSiteCount * 10,
});
const activity: AccessActivitySummary = { total: 5, granted: 4, denied: 1 };

const params = (onSiteCount = 3) => ({
  tenantId,
  organizationId,
  zoneId,
  zoneCode: "Z-1",
  zoneName: "Main Gate",
  securityLevel: "restricted",
  zoneStatus: "active",
  presence: presence(onSiteCount),
  openIncidentCount: 2,
  activeCredentialCount: 7,
  activity,
  refreshedAt: "2026-07-01T00:00:00.000Z",
});

describe("SafetyProfile aggregate", () => {
  it("composes a profile from a zone's derived posture", () => {
    const p = composeSafetyProfile(params());
    expect(p.zoneCode).toBe("Z-1");
    expect(p.onSiteVisitorCount).toBe(3);
    expect(p.available).toBe(7);
    expect(p.overCapacity).toBe(false);
    expect(p.openIncidentCount).toBe(2);
    expect(p.activeCredentialCount).toBe(7);
    expect(p.accessGrantedCount).toBe(4);
    expect(p.accessDeniedCount).toBe(1);
  });

  it("refreshes in place, preserving identity and creation time", () => {
    const first = composeSafetyProfile(params(3));
    const refreshed = refreshSafetyProfile(first, params(8));
    expect(refreshed.id).toBe(first.id);
    expect(refreshed.createdAt).toBe(first.createdAt);
    expect(refreshed.onSiteVisitorCount).toBe(8);
  });
});
