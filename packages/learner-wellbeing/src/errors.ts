import { PlatformError } from "@knowget/exceptions";

// --- Shared directory errors -----------------------------------------------------

/**
 * The learner a wellbeing record concerns does not exist in the tenant (P2-D03). Every
 * wellbeing record is about a Student; the platform links to it and derives the
 * learner's organization from it, never duplicating either.
 */
export class StudentNotFoundForWellbeingError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}

/**
 * A person referenced by a wellbeing record (a counsellor, reporter or responsible
 * staff member) does not exist in the tenant. Staff are Persons (P2-D01-M02).
 */
export class PersonNotFoundForWellbeingError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

// --- Wellbeing profile errors ----------------------------------------------------

/** The requested wellbeing profile does not exist in the current tenant. */
export class WellbeingProfileNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Wellbeing profile "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A learner already has a wellbeing profile. */
export class DuplicateWellbeingProfileError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" already has a wellbeing profile`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId },
    });
  }
}

/** A success metric must carry a non-empty name. */
export class EmptyMetricNameError extends PlatformError {
  constructor() {
    super("A success metric must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

// --- Health record errors --------------------------------------------------------

/** The requested health record does not exist in the current tenant. */
export class HealthRecordNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Health record "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A learner already has a health record. */
export class DuplicateHealthRecordError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" already has a health record`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId },
    });
  }
}

/** A health entry (allergy, condition, immunization, medication, alert) must carry a non-empty name. */
export class EmptyHealthEntryError extends PlatformError {
  constructor(field: string) {
    super(`A health entry must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The referenced medical alert is not on this health record. */
export class MedicalAlertNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Medical alert "${id}" is not on this health record`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}
