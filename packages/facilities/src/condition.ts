import type {
  BuildingCondition,
  BuildingConditionMemberView,
  CampusConditionSummary,
  ServiceStatus,
  SpaceConditionView,
  SystemConditionView,
} from "./facilities-view";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to` (both `YYYY-MM-DD`, UTC midnight). Negative when `to` precedes `from`. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

/** `date` advanced by `days` whole days, as a `YYYY-MM-DD` string. */
function addDays(date: string, days: number): string {
  const result = new Date(Date.parse(date) + days * MS_PER_DAY);
  return result.toISOString().slice(0, 10);
}

/**
 * The pure building-condition engine — rolls a building's spaces and fixed systems into a single condition
 * picture: the space counts and capacities (total, and available), the system counts (operational, under
 * maintenance), and a readiness percent (available capacity against total). **Decommissioned spaces and
 * systems are terminal and excluded** — they are no longer part of the building's live inventory, so they do
 * not count toward the space/system counts or the total capacity (a retired wing must not permanently
 * depress readiness). Draft and out-of-service spaces still count toward the total (future / temporarily-down
 * capacity), only `available` capacity counts as ready. Pure and deterministic. Built and tested before any
 * aggregate depends on it.
 */
export function computeBuildingCondition(
  spaces: readonly SpaceConditionView[],
  systems: readonly SystemConditionView[],
): BuildingCondition {
  let spaceCount = 0;
  let availableSpaceCount = 0;
  let outOfServiceSpaceCount = 0;
  let totalCapacity = 0;
  let availableCapacity = 0;
  for (const space of spaces) {
    if (space.status === "decommissioned") {
      continue;
    }
    spaceCount += 1;
    totalCapacity += space.capacity;
    if (space.status === "available") {
      availableSpaceCount += 1;
      availableCapacity += space.capacity;
    } else if (space.status === "out_of_service") {
      outOfServiceSpaceCount += 1;
    }
  }
  let systemCount = 0;
  let operationalSystemCount = 0;
  let systemsUnderMaintenance = 0;
  for (const system of systems) {
    if (system.status === "decommissioned") {
      continue;
    }
    systemCount += 1;
    if (system.status === "operational") {
      operationalSystemCount += 1;
    } else if (system.status === "under_maintenance") {
      systemsUnderMaintenance += 1;
    }
  }
  return {
    spaceCount,
    availableSpaceCount,
    outOfServiceSpaceCount,
    totalCapacity,
    availableCapacity,
    systemCount,
    operationalSystemCount,
    systemsUnderMaintenance,
    readinessPercent: totalCapacity > 0 ? Math.round((availableCapacity / totalCapacity) * 100) : 0,
  };
}

/**
 * The pure campus-rollup engine — summarizes a set of building conditions into a campus picture: building,
 * space and system counts, the total and available capacity, and the operational systems. Pure and
 * deterministic.
 */
export function summarizeCampusCondition(
  buildings: readonly BuildingConditionMemberView[],
): CampusConditionSummary {
  let spaceCount = 0;
  let availableSpaceCount = 0;
  let totalCapacity = 0;
  let availableCapacity = 0;
  let systemCount = 0;
  let operationalSystemCount = 0;
  for (const building of buildings) {
    spaceCount += building.spaceCount;
    availableSpaceCount += building.availableSpaceCount;
    totalCapacity += building.totalCapacity;
    availableCapacity += building.availableCapacity;
    systemCount += building.systemCount;
    operationalSystemCount += building.operationalSystemCount;
  }
  return {
    buildingCount: buildings.length,
    spaceCount,
    availableSpaceCount,
    totalCapacity,
    availableCapacity,
    systemCount,
    operationalSystemCount,
  };
}

/**
 * The pure service-status helper — a facility system's next-due service date (from its last-serviced date
 * and service interval) and whether it is due soon (within the warning window, inclusive) or overdue, as
 * of a date. A never-serviced system (no last-serviced date) has no computable due date, so it is neither
 * due-soon nor overdue here. Pure, deterministic and clock-free.
 */
export function computeServiceStatus(
  lastServicedOn: string | null,
  serviceIntervalDays: number,
  asOfDate: string,
  warningDays = 14,
): ServiceStatus {
  if (lastServicedOn === null) {
    return { nextDueOn: null, band: "ok", isDueSoon: false, isOverdue: false };
  }
  const nextDueOn = addDays(lastServicedOn, serviceIntervalDays);
  const daysToDue = daysBetween(asOfDate, nextDueOn);
  const isOverdue = daysToDue < 0;
  const isDueSoon = !isOverdue && daysToDue <= warningDays;
  const band = isOverdue ? "overdue" : isDueSoon ? "due_soon" : "ok";
  return { nextDueOn, band, isDueSoon, isOverdue };
}
