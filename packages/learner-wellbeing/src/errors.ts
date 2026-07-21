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

// --- Behaviour record errors -----------------------------------------------------

/** The requested behaviour record does not exist in the current tenant. */
export class BehaviourRecordNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Behaviour record "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A learner already has a behaviour record. */
export class DuplicateBehaviourRecordError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" already has a behaviour record`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId },
    });
  }
}

/** A behaviour entry (note, category, description, goal, action) must be non-empty. */
export class EmptyBehaviourEntryError extends PlatformError {
  constructor(field: string) {
    super(`A behaviour entry must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The referenced behaviour observation is not on this record. */
export class BehaviourObservationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Behaviour observation "${id}" is not on this record`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The referenced behaviour incident is not on this record. */
export class BehaviourIncidentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Behaviour incident "${id}" is not on this record`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The referenced restorative action is not on this incident. */
export class RestorativeActionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Restorative action "${id}" is not on this incident`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The referenced behaviour goal is not on this record. */
export class BehaviourGoalNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Behaviour goal "${id}" is not on this record`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Counselling case errors -----------------------------------------------------

/** The requested counselling case does not exist in the current tenant. */
export class CounsellingCaseNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Counselling case "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The counselling case is closed and cannot be modified. */
export class CounsellingCaseClosedError extends PlatformError {
  constructor(id: string) {
    super(`Counselling case "${id}" is closed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A counselling entry (concern, note, referral, goal, outcome) must be non-empty. */
export class EmptyCounsellingEntryError extends PlatformError {
  constructor(field: string) {
    super(`A counselling entry must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The referenced counselling goal is not on this case. */
export class CounsellingGoalNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Counselling goal "${id}" is not on this case`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Safeguarding case errors ----------------------------------------------------

/** The requested safeguarding case does not exist in the current tenant. */
export class SafeguardingCaseNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Safeguarding case "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The safeguarding case is resolved and cannot be modified. */
export class SafeguardingCaseResolvedError extends PlatformError {
  constructor(id: string) {
    super(`Safeguarding case "${id}" is resolved`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A safeguarding entry (concern, category, report, escalation, resolution) must be non-empty. */
export class EmptySafeguardingEntryError extends PlatformError {
  constructor(field: string) {
    super(`A safeguarding entry must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}
