import type {
  HostelOccupancy,
  HostelOccupancyMemberView,
  ResidenceOccupancySummary,
  RoomOccupancy,
  RoomOccupancyMemberView,
} from "./residential-view";

/**
 * The pure room-occupancy engine — a room's bed count against its active occupant count: the beds still
 * available (negative when over-allocated), the occupancy percent, and whether it is over capacity. Pure
 * and deterministic. Built and tested before any aggregate depends on it.
 */
export function computeRoomOccupancy(bedCount: number, occupantCount: number): RoomOccupancy {
  return {
    bedCount,
    occupantCount,
    bedsAvailable: bedCount - occupantCount,
    occupancyPercent: bedCount > 0 ? Math.round((occupantCount / bedCount) * 100) : 0,
    overCapacity: occupantCount > bedCount,
  };
}

/**
 * The pure hostel-occupancy engine — rolls a hostel's rooms up into a single occupancy picture: room
 * count, total beds and occupants, the beds available, the occupancy percent and the count of
 * over-capacity rooms. Pure and deterministic.
 */
export function computeHostelOccupancy(rooms: readonly RoomOccupancyMemberView[]): HostelOccupancy {
  let bedCount = 0;
  let occupantCount = 0;
  let overCapacityRoomCount = 0;
  for (const room of rooms) {
    bedCount += room.bedCount;
    occupantCount += room.occupantCount;
    if (room.overCapacity) {
      overCapacityRoomCount += 1;
    }
  }
  return {
    roomCount: rooms.length,
    bedCount,
    occupantCount,
    bedsAvailable: bedCount - occupantCount,
    occupancyPercent: bedCount > 0 ? Math.round((occupantCount / bedCount) * 100) : 0,
    overCapacityRoomCount,
  };
}

/**
 * The pure institution-rollup engine — summarizes a set of hostel occupancies into a leadership picture:
 * hostel count, total beds and occupants, beds available, and the count of over-capacity hostels. Pure
 * and deterministic.
 */
export function summarizeResidenceOccupancy(
  hostels: readonly HostelOccupancyMemberView[],
): ResidenceOccupancySummary {
  let bedCount = 0;
  let occupantCount = 0;
  let overCapacityHostelCount = 0;
  for (const hostel of hostels) {
    bedCount += hostel.bedCount;
    occupantCount += hostel.occupantCount;
    if (hostel.overCapacity) {
      overCapacityHostelCount += 1;
    }
  }
  return {
    hostelCount: hostels.length,
    bedCount,
    occupantCount,
    bedsAvailable: bedCount - occupantCount,
    overCapacityHostelCount,
  };
}
