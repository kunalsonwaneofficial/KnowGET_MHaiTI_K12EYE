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

// --- Prescription ----------------------------------------------------------------

/** The requested prescription does not exist in the current tenant. */
export class PrescriptionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Prescription "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A prescription must name a non-empty medication. */
export class EmptyMedicationError extends PlatformError {
  constructor() {
    super("A prescription must name a non-empty medication", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A prescription's doses-per-day, duration and recorded doses must be positive integers. */
export class InvalidRegimenError extends PlatformError {
  constructor(value: number) {
    super(`Prescription regimen value "${value}" must be a positive integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** No further doses can be recorded — the prescribed total has already been administered. */
export class DoseLimitReachedError extends PlatformError {
  constructor(id: string) {
    super(`Prescription "${id}" has already had every prescribed dose administered`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** An invalid prescription status transition was attempted. */
export class InvalidPrescriptionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A prescription cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Sick-bay admission ----------------------------------------------------------

/** The requested sick-bay admission does not exist in the current tenant. */
export class AdmissionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Sick-bay admission "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A sick-bay admission must carry a non-empty bed label. */
export class EmptyBedLabelError extends PlatformError {
  constructor() {
    super("A sick-bay admission must carry a non-empty bed label", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An invalid sick-bay-admission status transition was attempted. */
export class InvalidAdmissionTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A sick-bay admission cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The sick-bay bed already holds an active admission. */
export class BedOccupiedError extends PlatformError {
  constructor(centreId: string, bedLabel: string) {
    super(`Sick-bay bed "${bedLabel}" at centre "${centreId}" is already occupied`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { centreId, bedLabel },
    });
  }
}

/** The patient already has an active sick-bay admission. */
export class PatientAlreadyAdmittedError extends PlatformError {
  constructor(patientId: string) {
    super(`Patient "${patientId}" already has an active sick-bay admission`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { patientId },
    });
  }
}

/** The sick bay is at capacity — no bed is free to admit into. */
export class SickBayFullError extends PlatformError {
  constructor(centreId: string) {
    super(`The sick bay at centre "${centreId}" is at capacity`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { centreId },
    });
  }
}

// --- Referral --------------------------------------------------------------------

/** The requested referral does not exist in the current tenant. */
export class ReferralNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Referral "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A referral must name a non-empty external target. */
export class EmptyReferralTargetError extends PlatformError {
  constructor() {
    super("A referral must name a non-empty external target", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An invalid referral status transition was attempted. */
export class InvalidReferralTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A referral cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Centre profile --------------------------------------------------------------

/** The requested health-centre profile does not exist in the current tenant. */
export class CentreProfileNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Health-centre profile "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}
