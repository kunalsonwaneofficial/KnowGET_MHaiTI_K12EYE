import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a facilities record attaches to does not exist
 * in the tenant. Buildings, systems and sensors belong to an organization; the domain links to it and
 * never re-models it.
 */
export class OrganizationNotFoundForFacilitiesError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the facilities record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The employee (P2-D12) a work order is assigned to does not exist in the tenant. */
export class EmployeeNotFoundForFacilitiesError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found; cannot assign the work order`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

// --- Building --------------------------------------------------------------------

/** The requested building does not exist in the current tenant. */
export class BuildingNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Building "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A building must carry a non-empty code. */
export class EmptyBuildingCodeError extends PlatformError {
  constructor() {
    super("A building must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A building must carry a non-empty name. */
export class EmptyBuildingNameError extends PlatformError {
  constructor() {
    super("A building must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A building's floor count must be a non-negative integer. */
export class InvalidFloorsError extends PlatformError {
  constructor(floors: number) {
    super(`Floor count "${floors}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { floors },
    });
  }
}

/** The building code is already in use within the tenant. */
export class DuplicateBuildingCodeError extends PlatformError {
  constructor(code: string) {
    super(`Building code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid building status transition was attempted. */
export class InvalidBuildingTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A building cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The building is not active and cannot take the requested operation. */
export class BuildingNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Building "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Space -----------------------------------------------------------------------

/** The requested space does not exist in the current tenant. */
export class SpaceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Space "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A space must carry a non-empty code. */
export class EmptySpaceCodeError extends PlatformError {
  constructor() {
    super("A space must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A space capacity or a building floor must be a non-negative integer. */
export class InvalidCapacityError extends PlatformError {
  constructor(value: number) {
    super(`Value "${value}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** The space code is already in use within the building. */
export class DuplicateSpaceCodeError extends PlatformError {
  constructor(code: string) {
    super(`Space code "${code}" is already in use in this building`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid space status transition was attempted. */
export class InvalidSpaceTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A space cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Facility system -------------------------------------------------------------

/** The requested facility system does not exist in the current tenant. */
export class FacilitySystemNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Facility system "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A facility system must carry a non-empty code. */
export class EmptySystemCodeError extends PlatformError {
  constructor() {
    super("A facility system must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A service interval must be a positive integer number of days. */
export class InvalidServiceIntervalError extends PlatformError {
  constructor(days: number) {
    super(`Service interval "${days}" must be a positive integer number of days`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { days },
    });
  }
}

/** The facility-system code is already in use within the building. */
export class DuplicateSystemCodeError extends PlatformError {
  constructor(code: string) {
    super(`Facility-system code "${code}" is already in use in this building`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid facility-system status transition was attempted. */
export class InvalidSystemTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A facility system cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Sensor ----------------------------------------------------------------------

/** The requested sensor does not exist in the current tenant. */
export class SensorNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Sensor "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A sensor must carry a non-empty code. */
export class EmptySensorCodeError extends PlatformError {
  constructor() {
    super("A sensor must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The sensor code is already in use within the tenant. */
export class DuplicateSensorCodeError extends PlatformError {
  constructor(code: string) {
    super(`Sensor code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An active sensor already reads this metric in this space. */
export class DuplicateActiveSensorError extends PlatformError {
  constructor(spaceId: string, metric: string) {
    super(`An active "${metric}" sensor already exists in space "${spaceId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { spaceId, metric },
    });
  }
}

/** An invalid sensor status transition was attempted. */
export class InvalidSensorTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A sensor cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Environment reading ---------------------------------------------------------

/** A sensor reading's value must be a finite number. */
export class InvalidReadingValueError extends PlatformError {
  constructor(value: number) {
    super(`Reading value "${value}" must be a finite number`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** Readings may only be recorded against an active sensor. */
export class SensorNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Sensor "${id}" is not active; it cannot record readings`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Maintenance order -----------------------------------------------------------

/** The requested maintenance order does not exist in the current tenant. */
export class MaintenanceOrderNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Maintenance order "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A maintenance order must carry a non-empty code. */
export class EmptyMaintenanceCodeError extends PlatformError {
  constructor() {
    super("A maintenance order must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A maintenance order must carry a non-empty summary. */
export class EmptyMaintenanceSummaryError extends PlatformError {
  constructor() {
    super("A maintenance order must have a non-empty summary", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The maintenance-order code is already in use within the tenant. */
export class DuplicateMaintenanceCodeError extends PlatformError {
  constructor(code: string) {
    super(`Maintenance-order code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid maintenance-order status transition was attempted. */
export class InvalidMaintenanceTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A maintenance order cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
