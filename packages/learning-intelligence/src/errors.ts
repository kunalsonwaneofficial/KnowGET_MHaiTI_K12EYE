import { PlatformError } from "@knowget/exceptions";

// --- Cross-domain directory errors -----------------------------------------------
// Every intelligence record is owned by an Organization (P2-D01-M01) and is about a Student
// (P2-D03), validated through injected directory ports, so the pure package never depends on
// those domain packages. Upstream evidence (assessment, attendance, wellbeing, instruction) is
// referenced, not validated per-item — this domain synthesizes those domains, it does not
// recompute or re-verify them.

/** The organization an intelligence record belongs to does not exist in the tenant. */
export class OrganizationNotFoundForInsightError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The student an intelligence record is about does not exist (P2-D03). */
export class StudentNotFoundForInsightError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}

/** An intelligence field (title, narrative, action, goal) must carry a non-empty value. */
export class EmptyInsightFieldError extends PlatformError {
  constructor(field: string) {
    super(`This learning-intelligence record must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

// --- Learner insight profile errors ----------------------------------------------

/** The requested learner insight profile does not exist in the current tenant. */
export class LearnerInsightProfileNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Learner insight profile "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A student already has a learner insight profile. */
export class DuplicateLearnerInsightProfileError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" already has a learner insight profile`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId },
    });
  }
}

// --- Learning signal errors ------------------------------------------------------

/** The requested learning signal does not exist in the current tenant. */
export class LearningSignalNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Learning signal "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A learning signal is invalid (e.g. a non-finite reading, or an empty metric). */
export class InvalidLearningSignalError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid learning signal: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

// --- Early warning errors --------------------------------------------------------

/** The requested early warning does not exist in the current tenant. */
export class EarlyWarningNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Early warning "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The early warning is not in a state from which the attempted transition is allowed. */
export class EarlyWarningStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Early warning "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Educational insight errors --------------------------------------------------

/** The requested educational insight does not exist in the current tenant. */
export class EducationalInsightNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Educational insight "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The educational insight is not in a state from which the attempted transition is allowed. */
export class EducationalInsightStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Educational insight "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Recommendation errors -------------------------------------------------------

/** The requested recommendation does not exist in the current tenant. */
export class RecommendationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Recommendation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The recommendation is not in a state from which the attempted transition is allowed. */
export class RecommendationStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Recommendation "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Growth plan errors ----------------------------------------------------------

/** The requested growth plan does not exist in the current tenant. */
export class GrowthPlanNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Growth plan "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The growth plan is not in a state from which the attempted transition is allowed. */
export class GrowthPlanStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Growth plan "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Cohort insight errors -------------------------------------------------------

/** The requested cohort insight does not exist in the current tenant. */
export class CohortInsightNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Cohort insight "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}
