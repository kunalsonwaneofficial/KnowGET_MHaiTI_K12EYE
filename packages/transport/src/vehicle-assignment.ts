import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidAssignmentTransitionError } from "./errors";
import type { AssignmentStatus } from "./transport-value";

/**
 * A vehicle assignment — binds a {@link Vehicle} and a {@link Driver} to a {@link Route} for a period.
 * It runs `active → ended` (terminal). At most one assignment is active per route at a time; the service
 * validates the route, vehicle and driver are all active (and the driver's licence valid) when it is
 * created. The organization is derived from the route.
 */
export interface VehicleAssignment {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly routeId: Uuid;
  readonly vehicleId: Uuid;
  readonly driverId: Uuid;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: AssignmentStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface CreateAssignmentParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly routeId: Uuid;
  readonly vehicleId: Uuid;
  readonly driverId: Uuid;
  readonly effectiveFrom: string;
}

/** Create a vehicle assignment (status `active`). */
export function createVehicleAssignment(params: CreateAssignmentParams): VehicleAssignment {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    routeId: params.routeId,
    vehicleId: params.vehicleId,
    driverId: params.driverId,
    effectiveFrom: params.effectiveFrom,
    effectiveTo: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (
  assignment: VehicleAssignment,
  patch: Partial<VehicleAssignment>,
): VehicleAssignment => ({
  ...assignment,
  ...patch,
  updatedAt: nowIso(),
});

/** End an active assignment (→ `ended`), recording the effective end date. */
export function endAssignment(
  assignment: VehicleAssignment,
  effectiveTo?: string | null,
): VehicleAssignment {
  if (assignment.status !== "active") {
    throw new InvalidAssignmentTransitionError(assignment.status, "ended");
  }
  return touch(assignment, { status: "ended", effectiveTo: effectiveTo ?? null });
}

/** Whether the assignment is currently active. */
export const isAssignmentActive = (assignment: VehicleAssignment): boolean =>
  assignment.status === "active";
