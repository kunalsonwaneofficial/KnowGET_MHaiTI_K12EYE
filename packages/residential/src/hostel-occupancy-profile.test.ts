import { describe, expect, it } from "vitest";
import type { TenantId, Uuid } from "@knowget/types";
import {
  createHostelOccupancyProfile,
  profileMemberView,
  refreshHostelOccupancyProfile,
} from "./hostel-occupancy-profile";
import type { HostelOccupancy } from "./residential-view";

const tenantId = "11111111-1111-1111-1111-111111111111" as TenantId;
const organizationId = "22222222-2222-2222-2222-222222222222" as Uuid;
const hostelId = "33333333-3333-3333-3333-333333333333" as Uuid;

const occ = (bedCount: number, occupantCount: number): HostelOccupancy => ({
  roomCount: 2,
  bedCount,
  occupantCount,
  bedsAvailable: bedCount - occupantCount,
  occupancyPercent: bedCount > 0 ? Math.round((occupantCount / bedCount) * 100) : 0,
  overCapacityRoomCount: occupantCount > bedCount ? 1 : 0,
});

describe("hostel occupancy profile", () => {
  it("creates version 1 with a derived hostel-level over-capacity flag", () => {
    const profile = createHostelOccupancyProfile({
      tenantId,
      organizationId,
      hostelId,
      hostelCode: "H1",
      occupancy: occ(10, 6),
    });
    expect(profile.version).toBe(1);
    expect(profile.bedsAvailable).toBe(4);
    expect(profile.overCapacity).toBe(false);
    expect(profileMemberView(profile)).toEqual({
      bedCount: 10,
      occupantCount: 6,
      overCapacity: false,
    });
  });

  it("refreshes with a version bump and flips over-capacity", () => {
    const first = createHostelOccupancyProfile({
      tenantId,
      organizationId,
      hostelId,
      hostelCode: "H1",
      occupancy: occ(10, 6),
    });
    const refreshed = refreshHostelOccupancyProfile(first, "H1", occ(10, 12));
    expect(refreshed.version).toBe(2);
    expect(refreshed.occupantCount).toBe(12);
    expect(refreshed.overCapacity).toBe(true);
    expect(refreshed.id).toBe(first.id);
  });
});
