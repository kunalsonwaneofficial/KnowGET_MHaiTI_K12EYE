import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import type { RouteUtilizationMemberView, SeatUtilization } from "./transport-view";

/**
 * A route utilization profile — the descriptive read model of a route's seat usage, kept in step with
 * its active subscriptions and assigned vehicle by the pure seat-utilization engine. It carries the
 * assigned vehicle capacity (0 when there is no active assignment), the active subscriber count, the
 * seats available and utilization percent, and whether the route is over capacity. It is never a
 * transaction: it is refreshed (bumping `version`) whenever the route's subscriptions or assignment
 * change. Exactly one profile per route.
 */
export interface RouteUtilizationProfile {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly routeId: Uuid;
  readonly routeCode: string;
  readonly capacity: number;
  readonly subscriberCount: number;
  readonly seatsAvailable: number;
  readonly utilizationPercent: number;
  readonly overCapacity: boolean;
  readonly hasActiveAssignment: boolean;
  readonly version: number;
  readonly refreshedAt: ISODateString | null;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateRouteUtilizationProfileParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly routeId: Uuid;
  readonly routeCode: string;
  readonly utilization: SeatUtilization;
  readonly hasActiveAssignment: boolean;
}

type UtilizationFields = Pick<
  RouteUtilizationProfile,
  "capacity" | "subscriberCount" | "seatsAvailable" | "utilizationPercent" | "overCapacity"
>;

const fieldsOf = (utilization: SeatUtilization): UtilizationFields => ({
  capacity: utilization.capacity,
  subscriberCount: utilization.subscriberCount,
  seatsAvailable: utilization.seatsAvailable,
  utilizationPercent: utilization.utilizationPercent,
  overCapacity: utilization.overCapacity,
});

/** Create a route utilization profile from a first reconciliation (version 1). */
export function createRouteUtilizationProfile(
  params: CreateRouteUtilizationProfileParams,
): RouteUtilizationProfile {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    routeId: params.routeId,
    routeCode: params.routeCode,
    ...fieldsOf(params.utilization),
    hasActiveAssignment: params.hasActiveAssignment,
    version: 1,
    refreshedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/** Refresh a profile from a fresh reconciliation, bumping the version. */
export function refreshRouteUtilizationProfile(
  existing: RouteUtilizationProfile,
  routeCode: string,
  utilization: SeatUtilization,
  hasActiveAssignment: boolean,
): RouteUtilizationProfile {
  const now = nowIso();
  return {
    ...existing,
    routeCode,
    ...fieldsOf(utilization),
    hasActiveAssignment,
    version: existing.version + 1,
    refreshedAt: now,
    updatedAt: now,
  };
}

/** The rollup member view of the profile (for the fleet-utilization engine). */
export const profileMemberView = (
  profile: RouteUtilizationProfile,
): RouteUtilizationMemberView => ({
  subscriberCount: profile.subscriberCount,
  overCapacity: profile.overCapacity,
});
