import { PlatformError } from "@knowget/exceptions";

/** A route schedule must have consecutive stops with strictly-increasing, valid time offsets. */
export class InvalidRouteScheduleError extends PlatformError {
  constructor(reason: string) {
    super(`Cannot compute route schedule: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a transport record attaches to does not
 * exist in the tenant. Vehicles, routes and trips belong to an organization; the domain links to it.
 */
export class OrganizationNotFoundForTransportError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the transport record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The employee (P2-D12) a driver links to does not exist in the tenant. */
export class EmployeeNotFoundForTransportError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found; cannot register the driver`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

// --- Vehicle ---------------------------------------------------------------------

/** The requested vehicle does not exist in the current tenant. */
export class VehicleNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Vehicle "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A vehicle must carry a non-empty registration number. */
export class EmptyVehicleRegistrationError extends PlatformError {
  constructor() {
    super("A vehicle must have a non-empty registration number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A vehicle's seating capacity must be a positive whole number of seats. */
export class InvalidCapacityError extends PlatformError {
  constructor(capacity: number) {
    super(`A seating capacity must be a positive integer, received ${capacity}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { capacity },
    });
  }
}

/** The vehicle registration number is already in use within the tenant. */
export class DuplicateVehicleRegistrationError extends PlatformError {
  constructor(registrationNumber: string) {
    super(`Vehicle registration "${registrationNumber}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { registrationNumber },
    });
  }
}

/** The requested vehicle lifecycle transition is not permitted. */
export class InvalidVehicleTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition vehicle from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Driver ----------------------------------------------------------------------

/** The requested driver does not exist in the current tenant. */
export class DriverNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Driver "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A driver must carry a non-empty licence number. */
export class EmptyLicenseNumberError extends PlatformError {
  constructor() {
    super("A driver must have a non-empty licence number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A driver's licence expiry must be a valid date. */
export class InvalidLicenseExpiryError extends PlatformError {
  constructor() {
    super("A driver's licence expiry must be a valid date", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The driver licence number is already in use within the tenant. */
export class DuplicateLicenseNumberError extends PlatformError {
  constructor(licenseNumber: string) {
    super(`Driver licence "${licenseNumber}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { licenseNumber },
    });
  }
}

/** The employee is already registered as a driver within the tenant. */
export class DuplicateDriverForEmployeeError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" is already registered as a driver`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { employeeId },
    });
  }
}

/** The requested driver lifecycle transition is not permitted. */
export class InvalidDriverTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition driver from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
