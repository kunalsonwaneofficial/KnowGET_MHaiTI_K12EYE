import type {
  MusterStatus,
  SitePresenceSummary,
  VisitPresenceView,
  ZonePresence,
  ZonePresenceMemberView,
} from "./campus-security-view";

/**
 * The pure presence engine — values a zone's live on-site count (its checked-in visits) against its safe
 * occupancy capacity: how many are present, how many places remain, whether it is over capacity, and an
 * occupancy percent. A capacity of zero means "not capacity-tracked" (no limit): available is zero, over
 * capacity is false, percent is zero. Pure and deterministic. Built and tested before any aggregate depends
 * on it.
 */
export function computeZonePresence(
  visits: readonly VisitPresenceView[],
  capacity: number,
): ZonePresence {
  let onSiteCount = 0;
  for (const visit of visits) {
    if (visit.status === "checked_in") {
      onSiteCount += 1;
    }
  }
  const capped = capacity > 0;
  return {
    onSiteCount,
    capacity,
    available: capped ? Math.max(0, capacity - onSiteCount) : 0,
    overCapacity: capped && onSiteCount > capacity,
    occupancyPercent: capped ? Math.round((onSiteCount / capacity) * 100) : 0,
  };
}

/**
 * The pure site-rollup engine — summarizes a set of zone presences into a campus picture: the zone count,
 * the total on-site headcount and the total capacity. Pure and deterministic.
 */
export function summarizeSitePresence(
  zones: readonly ZonePresenceMemberView[],
): SitePresenceSummary {
  let onSiteCount = 0;
  let totalCapacity = 0;
  for (const zone of zones) {
    onSiteCount += zone.onSiteCount;
    totalCapacity += zone.capacity;
  }
  return { zoneCount: zones.length, onSiteCount, totalCapacity };
}

/**
 * The pure muster engine — reconciles a drill's expected roster against the accounted-for headcount into the
 * **safety-critical unaccounted-for** number (never negative), whether everyone is accounted for, and a
 * completion percent (capped at 100). A zero expected roster is fully accounted for. Pure and deterministic —
 * this is the emergency-drill analog of the residential roll-call's unaccounted-for count.
 */
export function computeMusterStatus(expectedCount: number, accountedCount: number): MusterStatus {
  const unaccountedFor = Math.max(0, expectedCount - accountedCount);
  return {
    expectedCount,
    accountedCount,
    unaccountedFor,
    allAccountedFor: unaccountedFor === 0,
    completionPercent:
      expectedCount > 0
        ? Math.round((Math.min(accountedCount, expectedCount) / expectedCount) * 100)
        : 100,
  };
}
