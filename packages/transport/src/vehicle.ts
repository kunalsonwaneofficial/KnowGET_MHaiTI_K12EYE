import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyVehicleRegistrationError,
  InvalidCapacityError,
  InvalidVehicleTransitionError,
} from "./errors";
import type { VehicleOwnership, VehicleStatus, VehicleType } from "./transport-value";

/**
 * A fleet vehicle — a bus, minibus, van or car the institution operates for transport. It carries a
 * registration number (unique within the tenant), a seating capacity that bounds trip occupancy, and an
 * ownership (owned vs contracted). It runs `active ↔ under_maintenance` (temporarily off the road) and
 * `→ retired` (a terminal end of service). Only an `active` vehicle can be assigned to a route.
 */
export interface Vehicle {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly registrationNumber: string;
  readonly type: VehicleType;
  readonly make: string | null;
  readonly model: string | null;
  readonly seatingCapacity: number;
  readonly ownership: VehicleOwnership;
  readonly status: VehicleStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterVehicleParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly registrationNumber: string;
  readonly type: VehicleType;
  readonly seatingCapacity: number;
  readonly ownership: VehicleOwnership;
  readonly make?: string | null;
  readonly model?: string | null;
}

const requireCapacity = (capacity: number): number => {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new InvalidCapacityError(capacity);
  }
  return capacity;
};

/** Register a fleet vehicle (status `active`). Registration and a positive capacity required. */
export function registerVehicle(params: RegisterVehicleParams): Vehicle {
  const registrationNumber = params.registrationNumber.trim();
  if (registrationNumber.length === 0) {
    throw new EmptyVehicleRegistrationError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    registrationNumber,
    type: params.type,
    make: params.make?.trim() || null,
    model: params.model?.trim() || null,
    seatingCapacity: requireCapacity(params.seatingCapacity),
    ownership: params.ownership,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (vehicle: Vehicle, patch: Partial<Vehicle>): Vehicle => ({
  ...vehicle,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the vehicle's seating capacity (positive integer). */
export function setSeatingCapacity(vehicle: Vehicle, seatingCapacity: number): Vehicle {
  return touch(vehicle, { seatingCapacity: requireCapacity(seatingCapacity) });
}

/** Set (or clear) the vehicle's make and model. */
export const setVehicleMakeModel = (
  vehicle: Vehicle,
  make: string | null,
  model: string | null,
): Vehicle => touch(vehicle, { make: make?.trim() || null, model: model?.trim() || null });

/** Take an active vehicle off the road for maintenance (→ `under_maintenance`). */
export function sendVehicleToMaintenance(vehicle: Vehicle): Vehicle {
  if (vehicle.status !== "active") {
    throw new InvalidVehicleTransitionError(vehicle.status, "under_maintenance");
  }
  return touch(vehicle, { status: "under_maintenance" });
}

/** Return a vehicle from maintenance to service (→ `active`). */
export function returnVehicleFromMaintenance(vehicle: Vehicle): Vehicle {
  if (vehicle.status !== "under_maintenance") {
    throw new InvalidVehicleTransitionError(vehicle.status, "active");
  }
  return touch(vehicle, { status: "active" });
}

/** Retire a vehicle from the fleet (→ `retired`, terminal). */
export function retireVehicle(vehicle: Vehicle): Vehicle {
  if (vehicle.status === "retired") {
    throw new InvalidVehicleTransitionError(vehicle.status, "retired");
  }
  return touch(vehicle, { status: "retired" });
}

/** Whether the vehicle is active and available to be assigned to a route. */
export const isVehicleActive = (vehicle: Vehicle): boolean => vehicle.status === "active";
