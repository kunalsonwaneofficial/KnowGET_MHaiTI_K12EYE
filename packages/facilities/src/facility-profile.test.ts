import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import { composeFacilityProfile, refreshFacilityProfile } from "./facility-profile";
import type { BuildingCondition } from "./facilities-view";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const buildingId = "33333333-3333-3333-3333-333333333333" as Uuid;

const condition = (readinessPercent = 80): BuildingCondition => ({
  spaceCount: 10,
  availableSpaceCount: 8,
  outOfServiceSpaceCount: 1,
  totalCapacity: 300,
  availableCapacity: 240,
  systemCount: 4,
  operationalSystemCount: 3,
  systemsUnderMaintenance: 1,
  readinessPercent,
});

const params = (readinessPercent = 80) => ({
  tenantId,
  organizationId,
  buildingId,
  buildingCode: "B-1",
  buildingName: "Science Block",
  buildingStatus: "active",
  condition: condition(readinessPercent),
  openMaintenanceCount: 2,
  refreshedAt: "2026-07-01T00:00:00.000Z",
});

describe("FacilityProfile aggregate", () => {
  it("composes a profile from a building's derived condition", () => {
    const p = composeFacilityProfile(params());
    expect(p.buildingCode).toBe("B-1");
    expect(p.spaceCount).toBe(10);
    expect(p.availableCapacity).toBe(240);
    expect(p.systemsUnderMaintenance).toBe(1);
    expect(p.readinessPercent).toBe(80);
    expect(p.openMaintenanceCount).toBe(2);
  });

  it("refreshes in place, preserving identity and creation time", () => {
    const first = composeFacilityProfile(params(80));
    const refreshed = refreshFacilityProfile(first, params(55));
    expect(refreshed.id).toBe(first.id); // identity preserved
    expect(refreshed.createdAt).toBe(first.createdAt); // creation time preserved
    expect(refreshed.readinessPercent).toBe(55); // value updated
  });
});
