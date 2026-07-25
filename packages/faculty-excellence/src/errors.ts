import { PlatformError } from "@knowget/exceptions";

/**
 * The organization (campus / institution node, P2-D01-M01) a faculty record attaches to does not
 * exist in the tenant. Frameworks belong to an organization; the domain links to it, never duplicates.
 */
export class OrganizationNotFoundForFacultyError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the faculty record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/**
 * The employee a faculty record references does not exist in the tenant. A staff member observed,
 * coached or developed here is an Employee (P2-D12); the domain links to it and never duplicates it.
 */
export class EmployeeNotFoundForFacultyError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { employeeId },
    });
  }
}

// --- Competency framework --------------------------------------------------------

/** The requested competency framework does not exist in the current tenant. */
export class FrameworkNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Competency framework "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A competency framework must carry a non-empty code. */
export class EmptyFrameworkCodeError extends PlatformError {
  constructor() {
    super("A competency framework must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A competency framework must carry a non-empty name. */
export class EmptyFrameworkNameError extends PlatformError {
  constructor() {
    super("A competency framework must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The framework code is already in use within the tenant. */
export class DuplicateFrameworkCodeError extends PlatformError {
  constructor(code: string) {
    super(`Competency framework code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** The requested competency-framework lifecycle transition is not permitted. */
export class InvalidFrameworkTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition competency framework from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** Only a draft framework may have its competencies edited; once active they are frozen. */
export class FrameworkNotEditableError extends PlatformError {
  constructor(id: string, status: string) {
    super(`Competency framework "${id}" is "${status}"; its competencies can no longer be edited`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, status },
    });
  }
}

/** A competency must carry a non-empty key. */
export class EmptyCompetencyKeyError extends PlatformError {
  constructor() {
    super("A competency must have a non-empty key", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A competency must carry a non-empty name. */
export class EmptyCompetencyNameError extends PlatformError {
  constructor() {
    super("A competency must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The competency key is already used within the framework. */
export class DuplicateCompetencyKeyError extends PlatformError {
  constructor(key: string) {
    super(`Competency key "${key}" is already used in this framework`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { key },
    });
  }
}

/** The referenced competency is not part of the framework. */
export class CompetencyNotFoundError extends PlatformError {
  constructor(key: string) {
    super(`Competency "${key}" is not part of this framework`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { key },
    });
  }
}

/** A framework must be active to be used for an observation. */
export class FrameworkNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Competency framework "${id}" is not active; it cannot be used for an observation`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Observation -----------------------------------------------------------------

/** The requested observation does not exist in the current tenant. */
export class ObservationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Observation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested observation lifecycle transition is not permitted. */
export class InvalidObservationTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition observation from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A conducted observation must carry at least one competency rating. */
export class EmptyRatingsError extends PlatformError {
  constructor() {
    super("A conducted observation must have at least one competency rating", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An observation rating must lie within the 1–4 scale. */
export class InvalidObservationRatingError extends PlatformError {
  constructor(competencyKey: string, rating: number) {
    super(`Rating for competency "${competencyKey}" must be between 1 and 4, received ${rating}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { competencyKey, rating },
    });
  }
}

/** A rated competency is not defined in the observation's framework. */
export class UnknownCompetencyError extends PlatformError {
  constructor(competencyKey: string) {
    super(`Competency "${competencyKey}" is not defined in the framework`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { competencyKey },
    });
  }
}

// --- Coaching engagement ---------------------------------------------------------

/** The requested coaching engagement does not exist in the current tenant. */
export class CoachingEngagementNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Coaching engagement "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A coaching engagement must carry a non-empty focus. */
export class EmptyFocusError extends PlatformError {
  constructor() {
    super("A coaching engagement must have a non-empty focus", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A staff member cannot coach themselves — coach and coachee must differ. */
export class SelfCoachingError extends PlatformError {
  constructor(employeeId: string) {
    super(`Employee "${employeeId}" cannot be both coach and coachee`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { employeeId },
    });
  }
}

/** The requested coaching-engagement lifecycle transition is not permitted. */
export class InvalidEngagementTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition coaching engagement from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A coachee may have at most one active coaching engagement at a time. */
export class DuplicateActiveEngagementError extends PlatformError {
  constructor(coacheeId: string) {
    super(`Employee "${coacheeId}" already has an active coaching engagement`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { coacheeId },
    });
  }
}

// --- Coaching session ------------------------------------------------------------

/** The requested coaching session does not exist in the current tenant. */
export class CoachingSessionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Coaching session "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A coaching session can only be logged against an active engagement. */
export class EngagementNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Coaching engagement "${id}" is not active; a session cannot be logged against it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}
