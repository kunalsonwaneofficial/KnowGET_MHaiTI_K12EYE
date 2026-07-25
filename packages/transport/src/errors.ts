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

// --- Route -----------------------------------------------------------------------

/** The requested route does not exist in the current tenant. */
export class RouteNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Route "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A route must carry a non-empty code. */
export class EmptyRouteCodeError extends PlatformError {
  constructor() {
    super("A route must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A route must carry a non-empty name. */
export class EmptyRouteNameError extends PlatformError {
  constructor() {
    super("A route must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The route code is already in use within the tenant. */
export class DuplicateRouteCodeError extends PlatformError {
  constructor(code: string) {
    super(`Route code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** The requested route lifecycle transition is not permitted. */
export class InvalidRouteTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition route from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A route's stops can only be edited while it is a draft. */
export class RouteNotEditableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Route "${id}" is "${status}"; its stops can only be edited while draft`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** A route must have at least one stop before it can be activated. */
export class EmptyRouteError extends PlatformError {
  constructor() {
    super("A route must have at least one stop before it can be activated", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The route is not active, so it cannot take assignments or subscriptions. */
export class RouteNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Route "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A stop must carry a non-empty key (its stable identifier within the route). */
export class EmptyStopKeyError extends PlatformError {
  constructor() {
    super("A route stop must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A stop must carry a non-empty name. */
export class EmptyStopNameError extends PlatformError {
  constructor() {
    super("A route stop must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A stop offset must be a non-negative whole number of minutes from departure. */
export class InvalidStopOffsetError extends PlatformError {
  constructor(offsetMinutes: number) {
    super(
      `A stop offset must be a non-negative integer number of minutes, received ${offsetMinutes}`,
      {
        code: "VALIDATION_ERROR",
        httpStatus: 422,
        isOperational: true,
        details: { offsetMinutes },
      },
    );
  }
}

/** A stop key must be unique within its route. */
export class DuplicateStopKeyError extends PlatformError {
  constructor(key: string) {
    super(`Route stop key "${key}" is already in use on this route`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The requested route stop was not found on the route. */
export class RouteStopNotFoundError extends PlatformError {
  constructor(key: string) {
    super(`Route stop "${key}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { key },
    });
  }
}

// --- Vehicle assignment ----------------------------------------------------------

/** The requested vehicle assignment does not exist in the current tenant. */
export class AssignmentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Vehicle assignment "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The route already has an active vehicle assignment; end it before creating another. */
export class RouteHasActiveAssignmentError extends PlatformError {
  constructor(routeId: string) {
    super(`Route "${routeId}" already has an active vehicle assignment`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { routeId },
    });
  }
}

/** The requested assignment lifecycle transition is not permitted. */
export class InvalidAssignmentTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition assignment from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The vehicle is not active, so it cannot be assigned to a route. */
export class VehicleNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Vehicle "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The driver is not active, so it cannot be assigned to a route. */
export class DriverNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Driver "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The driver's licence has expired as of the assignment's effective date. */
export class DriverLicenseExpiredError extends PlatformError {
  constructor(id: string, asOfDate: string) {
    super(`Driver "${id}" licence has expired as of ${asOfDate}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, asOfDate },
    });
  }
}

// --- Transport subscription ------------------------------------------------------

/** The student (P2-D03) a subscription is for does not exist in the tenant. */
export class StudentNotFoundForTransportError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found; cannot create the transport subscription`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}

/** The requested transport subscription does not exist in the current tenant. */
export class SubscriptionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Transport subscription "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The chosen pickup/drop stop is not a stop on the subscription's route. */
export class StopNotOnRouteError extends PlatformError {
  constructor(routeId: string, stopKey: string) {
    super(`Stop "${stopKey}" is not on route "${routeId}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { routeId, stopKey },
    });
  }
}

/** The student already has an open subscription on this route. */
export class DuplicateSubscriptionError extends PlatformError {
  constructor(studentId: string, routeId: string) {
    super(`Student "${studentId}" already has an open subscription on route "${routeId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId, routeId },
    });
  }
}

/** The requested subscription lifecycle transition is not permitted. */
export class InvalidSubscriptionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition subscription from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Trip ------------------------------------------------------------------------

/** The requested trip does not exist in the current tenant. */
export class TripNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Trip "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested trip lifecycle transition is not permitted. */
export class InvalidTripTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition trip from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Boarding/alighting can only be recorded while a trip is in progress. */
export class TripNotInProgressError extends PlatformError {
  constructor(id: string) {
    super(`Trip "${id}" is not in progress; cannot record boarding`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A boarding would put the trip over the vehicle's seating capacity. */
export class VehicleCapacityExceededError extends PlatformError {
  constructor(tripId: string, capacity: number) {
    super(`Boarding would exceed trip "${tripId}" capacity of ${capacity}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { tripId, capacity },
    });
  }
}

/** A student cannot alight from a trip they are not currently onboard. */
export class StudentNotOnboardError extends PlatformError {
  constructor(tripId: string, studentId: string) {
    super(`Student "${studentId}" is not onboard trip "${tripId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { tripId, studentId },
    });
  }
}

/** A trip boarding event must carry a student, a stop and a time. */
export class InvalidTripEventError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid trip event: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}
