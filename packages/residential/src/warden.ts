import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import { InvalidWardenTransitionError } from "./errors";
import type { WardenRole, WardenStatus } from "./residential-value";

/**
 * A warden — a staff member (Employee, P2-D12) responsible for supervising residential life. It carries
 * a supervisory role (chief warden / warden / assistant warden). It runs `active ↔ suspended` and
 * `→ relieved` (a terminal end). The employee's identity lives in the workforce domain and is never
 * duplicated here; the organization is derived from the employee, and one warden is allowed per employee.
 */
export interface Warden {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly role: WardenRole;
  readonly status: WardenStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterWardenParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly role: WardenRole;
}

/** Register a warden (status `active`). */
export function registerWarden(params: RegisterWardenParams): Warden {
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    role: params.role,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (warden: Warden, patch: Partial<Warden>): Warden => ({
  ...warden,
  ...patch,
  updatedAt: nowIso(),
});

/** Set the warden's supervisory role. */
export const setWardenRole = (warden: Warden, role: WardenRole): Warden => touch(warden, { role });

/** Suspend an active warden (→ `suspended`). */
export function suspendWarden(warden: Warden): Warden {
  if (warden.status !== "active") {
    throw new InvalidWardenTransitionError(warden.status, "suspended");
  }
  return touch(warden, { status: "suspended" });
}

/** Reinstate a suspended warden (→ `active`). */
export function reinstateWarden(warden: Warden): Warden {
  if (warden.status !== "suspended") {
    throw new InvalidWardenTransitionError(warden.status, "active");
  }
  return touch(warden, { status: "active" });
}

/** Relieve a warden of duty permanently (→ `relieved`, terminal). */
export function relieveWarden(warden: Warden): Warden {
  if (warden.status === "relieved") {
    throw new InvalidWardenTransitionError(warden.status, "relieved");
  }
  return touch(warden, { status: "relieved" });
}

/** Whether the warden is active (assignable to supervise a hostel). */
export const isWardenActive = (warden: Warden): boolean => warden.status === "active";
