import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/** The organization (campus / institution node, P2-D01-M01) a security record attaches to does not exist. */
export class OrganizationNotFoundForSecurityError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the security record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The person (P2-D01-M02) a visit host / incident reporter / credential holder references does not exist. */
export class PersonNotFoundForSecurityError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

/** The employee (P2-D12) an incident assignee / drill conductor / credential holder references does not exist. */
export class EmployeeNotFoundForSecurityError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

// --- Access zone -----------------------------------------------------------------

/** The requested access zone does not exist in the current tenant. */
export class AccessZoneNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Access zone "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An access zone must carry a non-empty code. */
export class EmptyZoneCodeError extends PlatformError {
  constructor() {
    super("An access zone must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An access zone must carry a non-empty name. */
export class EmptyZoneNameError extends PlatformError {
  constructor() {
    super("An access zone must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A zone's safe-occupancy capacity must be a non-negative integer. */
export class InvalidZoneCapacityError extends PlatformError {
  constructor(value: number) {
    super(`Zone capacity "${value}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** The access-zone code is already in use within the tenant. */
export class DuplicateZoneCodeError extends PlatformError {
  constructor(code: string) {
    super(`Access-zone code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid access-zone status transition was attempted. */
export class InvalidZoneTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An access zone cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Visitor ---------------------------------------------------------------------

/** The requested visitor does not exist in the current tenant. */
export class VisitorNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Visitor "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A visitor must carry a non-empty code. */
export class EmptyVisitorCodeError extends PlatformError {
  constructor() {
    super("A visitor must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A visitor must carry a non-empty name. */
export class EmptyVisitorNameError extends PlatformError {
  constructor() {
    super("A visitor must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The visitor code is already in use within the tenant. */
export class DuplicateVisitorCodeError extends PlatformError {
  constructor(code: string) {
    super(`Visitor code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid visitor status transition was attempted. */
export class InvalidVisitorTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A visitor cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The visitor is not active (blocked or archived) and cannot have a visit requested or approved. */
export class VisitorNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Visitor "${id}" is not active; a visit cannot be requested or approved for them`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Visit -----------------------------------------------------------------------

/** The requested visit does not exist in the current tenant. */
export class VisitNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Visit "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An invalid visit status transition was attempted. */
export class InvalidVisitTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A visit cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Access credential -----------------------------------------------------------

/** The requested access credential does not exist in the current tenant. */
export class AccessCredentialNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Access credential "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An access credential must carry a non-empty credential number. */
export class EmptyCredentialNumberError extends PlatformError {
  constructor() {
    super("An access credential must have a non-empty credential number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The credential number is already in use within the tenant. */
export class DuplicateCredentialNumberError extends PlatformError {
  constructor(credentialNumber: string) {
    super(`Credential number "${credentialNumber}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { credentialNumber },
    });
  }
}

/** An invalid access-credential status transition was attempted. */
export class InvalidCredentialTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An access credential cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Security incident -----------------------------------------------------------

/** The requested security incident does not exist in the current tenant. */
export class SecurityIncidentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Security incident "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A security incident must carry a non-empty code. */
export class EmptyIncidentCodeError extends PlatformError {
  constructor() {
    super("A security incident must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A security incident must carry a non-empty summary. */
export class EmptyIncidentSummaryError extends PlatformError {
  constructor() {
    super("A security incident must have a non-empty summary", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The incident code is already in use within the tenant. */
export class DuplicateIncidentCodeError extends PlatformError {
  constructor(code: string) {
    super(`Security-incident code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid security-incident status transition was attempted. */
export class InvalidIncidentTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A security incident cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A security incident cannot start investigation without an assignee. */
export class IncidentUnassignedError extends PlatformError {
  constructor(id: string) {
    super(`Security incident "${id}" must be assigned before investigation can start`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Emergency drill -------------------------------------------------------------

/** The requested emergency drill does not exist in the current tenant. */
export class EmergencyDrillNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Emergency drill "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An emergency drill must carry a non-empty code. */
export class EmptyDrillCodeError extends PlatformError {
  constructor() {
    super("An emergency drill must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A drill's expected roster or accounted-for headcount must be a non-negative integer. */
export class InvalidDrillCountError extends PlatformError {
  constructor(value: number) {
    super(`Drill headcount "${value}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** The drill code is already in use within the tenant. */
export class DuplicateDrillCodeError extends PlatformError {
  constructor(code: string) {
    super(`Emergency-drill code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid emergency-drill status transition was attempted. */
export class InvalidDrillTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An emergency drill cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
