import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a health-centre record attaches to does not
 * exist in the tenant. Health centres, clinicians and encounters belong to an organization; the domain
 * links to it and never re-models it.
 */
export class OrganizationNotFoundForHealthCentreError extends PlatformError {
  constructor(organizationId: string) {
    super(
      `Organization "${organizationId}" not found; cannot attach the health-centre record to it`,
      {
        code: "NOT_FOUND",
        httpStatus: 404,
        isOperational: true,
        details: { organizationId },
      },
    );
  }
}

/** The employee (P2-D12) a clinician links to does not exist in the tenant. */
export class EmployeeNotFoundForHealthCentreError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found; cannot register the clinician`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

/** The person (P2-D01-M02) a patient record is for does not exist in the tenant. */
export class PersonNotFoundForHealthCentreError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found; cannot attach the patient record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

// --- Health centre ---------------------------------------------------------------

/** The requested health centre does not exist in the current tenant. */
export class HealthCentreNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Health centre "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A health centre must carry a non-empty code. */
export class EmptyCentreCodeError extends PlatformError {
  constructor() {
    super("A health centre must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A health centre must carry a non-empty name. */
export class EmptyCentreNameError extends PlatformError {
  constructor() {
    super("A health centre must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A sick-bay bed capacity must be a non-negative integer. */
export class InvalidCapacityError extends PlatformError {
  constructor(capacity: number) {
    super(`Sick-bay capacity "${capacity}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { capacity },
    });
  }
}

/** The health-centre code is already in use within the tenant. */
export class DuplicateCentreCodeError extends PlatformError {
  constructor(code: string) {
    super(`Health-centre code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid health-centre status transition was attempted. */
export class InvalidHealthCentreTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A health centre cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The health centre is not active and cannot take the requested clinical operation. */
export class HealthCentreNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Health centre "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Clinician -------------------------------------------------------------------

/** The requested clinician does not exist in the current tenant. */
export class ClinicianNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Clinician "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A clinician is already registered for this employee in the tenant. */
export class DuplicateClinicianForEmployeeError extends PlatformError {
  constructor(employeeId: string) {
    super(`A clinician is already registered for employee "${employeeId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { employeeId },
    });
  }
}

/** An invalid clinician status transition was attempted. */
export class InvalidClinicianTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A clinician cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The clinician is not active and cannot be assigned or attributed the requested clinical work. */
export class ClinicianNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Clinician "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Appointment -----------------------------------------------------------------

/** The requested appointment does not exist in the current tenant. */
export class AppointmentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Appointment "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An invalid appointment status transition was attempted. */
export class InvalidAppointmentTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An appointment cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Clinical encounter ----------------------------------------------------------

/** The requested clinical encounter does not exist in the current tenant. */
export class EncounterNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Clinical encounter "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An invalid clinical-encounter status transition was attempted. */
export class InvalidEncounterTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A clinical encounter cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A clinical encounter cannot start until a clinician is assigned to attend it. */
export class EncounterClinicianRequiredError extends PlatformError {
  constructor(id: string) {
    super(`Clinical encounter "${id}" needs an assigned clinician before it can start`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}
