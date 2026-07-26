import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a residential record attaches to does not
 * exist in the tenant. Hostels, rooms and roll calls belong to an organization; the domain links to it.
 */
export class OrganizationNotFoundForResidentialError extends PlatformError {
  constructor(organizationId: string) {
    super(
      `Organization "${organizationId}" not found; cannot attach the residential record to it`,
      {
        code: "NOT_FOUND",
        httpStatus: 404,
        isOperational: true,
        details: { organizationId },
      },
    );
  }
}

/** The employee (P2-D12) a warden links to does not exist in the tenant. */
export class EmployeeNotFoundForResidentialError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found; cannot register the warden`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

/** The student (P2-D03) a residential record is for does not exist in the tenant. */
export class StudentNotFoundForResidentialError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found; cannot attach the residential record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}

// --- Hostel ----------------------------------------------------------------------

/** The requested hostel does not exist in the current tenant. */
export class HostelNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Hostel "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A hostel must carry a non-empty code. */
export class EmptyHostelCodeError extends PlatformError {
  constructor() {
    super("A hostel must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A hostel must carry a non-empty name. */
export class EmptyHostelNameError extends PlatformError {
  constructor() {
    super("A hostel must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The hostel code is already in use within the tenant. */
export class DuplicateHostelCodeError extends PlatformError {
  constructor(code: string) {
    super(`Hostel code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** The requested hostel lifecycle transition is not permitted. */
export class InvalidHostelTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition hostel from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The hostel is not active, so it cannot take rooms or allocations. */
export class HostelNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Hostel "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Warden ----------------------------------------------------------------------

/** The requested warden does not exist in the current tenant. */
export class WardenNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Warden "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The employee is already registered as a warden within the tenant. */
export class DuplicateWardenForEmployeeError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" is already registered as a warden`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { employeeId },
    });
  }
}

/** The requested warden lifecycle transition is not permitted. */
export class InvalidWardenTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition warden from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The warden is not active, so it cannot be assigned to supervise a hostel. */
export class WardenNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Warden "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}
