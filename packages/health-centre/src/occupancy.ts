import type {
  BayOccupancy,
  BayOccupancyMemberView,
  ClinicalOccupancySummary,
} from "./health-centre-view";

/**
 * The pure sick-bay-occupancy engine — a health centre's bed capacity against the patients currently
 * admitted: the beds still available (negative when over-admitted), the occupancy percent, and whether it
 * is over capacity. Pure and deterministic. Built and tested before any aggregate depends on it.
 */
export function computeBayOccupancy(bedCapacity: number, occupantCount: number): BayOccupancy {
  return {
    bedCapacity,
    occupantCount,
    bedsAvailable: bedCapacity - occupantCount,
    occupancyPercent: bedCapacity > 0 ? Math.round((occupantCount / bedCapacity) * 100) : 0,
    overCapacity: occupantCount > bedCapacity,
  };
}

/**
 * The pure institution-rollup engine — summarizes a set of health-centre sick-bay occupancies into a
 * leadership picture: centre count, total beds and occupants, the beds available, and the count of
 * over-capacity centres. Pure and deterministic.
 */
export function summarizeClinicalOccupancy(
  centres: readonly BayOccupancyMemberView[],
): ClinicalOccupancySummary {
  let bedCapacity = 0;
  let occupantCount = 0;
  let overCapacityCentreCount = 0;
  for (const centre of centres) {
    bedCapacity += centre.bedCapacity;
    occupantCount += centre.occupantCount;
    if (centre.overCapacity) {
      overCapacityCentreCount += 1;
    }
  }
  return {
    centreCount: centres.length,
    bedCapacity,
    occupantCount,
    bedsAvailable: bedCapacity - occupantCount,
    overCapacityCentreCount,
  };
}
