import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { HostelOccupancy, HostelOccupancyMemberView } from "./residential-view";

/**
 * A hostel occupancy profile — the descriptive read model of a hostel's bed usage, kept in step with its
 * rooms and active allocations by the pure occupancy engine. It carries the room count, total beds and
 * occupants, the beds available, the occupancy percent, the count of over-capacity rooms and a
 * hostel-level over-capacity flag. It is never a transaction: it is refreshed (bumping `version`)
 * whenever the hostel's rooms or allocations change. Exactly one profile per hostel.
 */
export interface HostelOccupancyProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly hostelCode: string;
  readonly roomCount: number;
  readonly bedCount: number;
  readonly occupantCount: number;
  readonly bedsAvailable: number;
  readonly occupancyPercent: number;
  readonly overCapacityRoomCount: number;
  readonly overCapacity: boolean;
  readonly version: number;
  readonly refreshedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateHostelOccupancyProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly hostelId: Uuid;
  readonly hostelCode: string;
  readonly occupancy: HostelOccupancy;
}

type OccupancyFields = Pick<
  HostelOccupancyProfile,
  | "roomCount"
  | "bedCount"
  | "occupantCount"
  | "bedsAvailable"
  | "occupancyPercent"
  | "overCapacityRoomCount"
  | "overCapacity"
>;

const fieldsOf = (occupancy: HostelOccupancy): OccupancyFields => ({
  roomCount: occupancy.roomCount,
  bedCount: occupancy.bedCount,
  occupantCount: occupancy.occupantCount,
  bedsAvailable: occupancy.bedsAvailable,
  occupancyPercent: occupancy.occupancyPercent,
  overCapacityRoomCount: occupancy.overCapacityRoomCount,
  overCapacity: occupancy.occupantCount > occupancy.bedCount,
});

/** Create a hostel occupancy profile from a first reconciliation (version 1). */
export function createHostelOccupancyProfile(
  params: CreateHostelOccupancyProfileParams,
): HostelOccupancyProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    hostelId: params.hostelId,
    hostelCode: params.hostelCode,
    ...fieldsOf(params.occupancy),
    version: 1,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refresh a profile from a fresh reconciliation, bumping the version. */
export function refreshHostelOccupancyProfile(
  existing: HostelOccupancyProfile,
  hostelCode: string,
  occupancy: HostelOccupancy,
): HostelOccupancyProfile {
  const now = nowIso();
  return {
    ...existing,
    hostelCode,
    ...fieldsOf(occupancy),
    version: existing.version + 1,
    refreshedAt: now,
    updatedAt: now,
  };
}

/** The rollup member view of the profile (for the institution occupancy engine). */
export const profileMemberView = (profile: HostelOccupancyProfile): HostelOccupancyMemberView => ({
  bedCount: profile.bedCount,
  occupantCount: profile.occupantCount,
  overCapacity: profile.overCapacity,
});
