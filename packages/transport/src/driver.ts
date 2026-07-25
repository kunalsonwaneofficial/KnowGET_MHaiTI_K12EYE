import { newUuid, nowIso } from "@knowget/shared";
import type { ISODateString, TenantId, Uuid } from "@knowget/types";
import {
  EmptyLicenseNumberError,
  InvalidDriverTransitionError,
  InvalidLicenseExpiryError,
} from "./errors";
import type { DriverStatus } from "./transport-value";

/**
 * A driver — a staff member (Employee, P2-D12) licensed to operate fleet vehicles. It carries the
 * driving-licence number (unique within the tenant), an optional licence class, and the licence expiry
 * date (used to bar assigning a driver whose licence has lapsed). It runs `active ↔ suspended` and
 * `→ deactivated` (a terminal end). The employee's identity lives in the workforce domain and is never
 * duplicated here; the organization is derived from the employee.
 */
export interface Driver {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly licenseNumber: string;
  readonly licenseClass: string | null;
  readonly licenseExpiry: string;
  readonly status: DriverStatus;
  readonly createdAt: ISODateString;
  readonly updatedAt: ISODateString;
}

export interface RegisterDriverParams {
  readonly tenantId: TenantId;
  readonly organizationId: Uuid;
  readonly employeeId: Uuid;
  readonly licenseNumber: string;
  readonly licenseExpiry: string;
  readonly licenseClass?: string | null;
}

const requireDate = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || Number.isNaN(new Date(trimmed).getTime())) {
    throw new InvalidLicenseExpiryError();
  }
  return trimmed;
};

/** Register a driver (status `active`). Licence number and a valid expiry date required. */
export function registerDriver(params: RegisterDriverParams): Driver {
  const licenseNumber = params.licenseNumber.trim();
  if (licenseNumber.length === 0) {
    throw new EmptyLicenseNumberError();
  }
  const now = nowIso();
  return {
    id: newUuid(),
    tenantId: params.tenantId,
    organizationId: params.organizationId,
    employeeId: params.employeeId,
    licenseNumber,
    licenseClass: params.licenseClass?.trim() || null,
    licenseExpiry: requireDate(params.licenseExpiry),
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

const touch = (driver: Driver, patch: Partial<Driver>): Driver => ({
  ...driver,
  ...patch,
  updatedAt: nowIso(),
});

/** Renew the driver's licence — a new number (optional) and a new expiry date. */
export function renewLicense(
  driver: Driver,
  licenseExpiry: string,
  licenseNumber?: string,
): Driver {
  const expiry = requireDate(licenseExpiry);
  if (licenseNumber === undefined) {
    return touch(driver, { licenseExpiry: expiry });
  }
  const trimmed = licenseNumber.trim();
  if (trimmed.length === 0) {
    throw new EmptyLicenseNumberError();
  }
  return touch(driver, { licenseExpiry: expiry, licenseNumber: trimmed });
}

/** Set (or clear) the driver's licence class. */
export const setLicenseClass = (driver: Driver, licenseClass: string | null): Driver =>
  touch(driver, { licenseClass: licenseClass?.trim() || null });

/** Suspend an active driver (→ `suspended`). */
export function suspendDriver(driver: Driver): Driver {
  if (driver.status !== "active") {
    throw new InvalidDriverTransitionError(driver.status, "suspended");
  }
  return touch(driver, { status: "suspended" });
}

/** Reinstate a suspended driver (→ `active`). */
export function reinstateDriver(driver: Driver): Driver {
  if (driver.status !== "suspended") {
    throw new InvalidDriverTransitionError(driver.status, "active");
  }
  return touch(driver, { status: "active" });
}

/** Deactivate a driver permanently (→ `deactivated`, terminal). */
export function deactivateDriver(driver: Driver): Driver {
  if (driver.status === "deactivated") {
    throw new InvalidDriverTransitionError(driver.status, "deactivated");
  }
  return touch(driver, { status: "deactivated" });
}

/** Whether the driver is active. */
export const isDriverActive = (driver: Driver): boolean => driver.status === "active";

/**
 * Whether the driver's licence is still valid as of a date-only (`YYYY-MM-DD`) value — the expiry is on
 * or after that date. Deterministic (no clock); the caller passes the as-of date.
 */
export const isLicenseValidAsOf = (driver: Driver, asOfDate: string): boolean =>
  driver.licenseExpiry >= asOfDate;
