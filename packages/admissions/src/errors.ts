import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/** The organization (institution node, P2-D01-M01) an admissions record attaches to does not exist. */
export class OrganizationNotFoundForAdmissionsError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the admissions record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The person (P2-D01-M02) an applicant references does not exist. */
export class PersonNotFoundForAdmissionsError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

// --- Marketing campaign ----------------------------------------------------------

/** The requested marketing campaign does not exist in the current tenant. */
export class CampaignNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Marketing campaign "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A marketing campaign must carry a non-empty code. */
export class EmptyCampaignCodeError extends PlatformError {
  constructor() {
    super("A marketing campaign must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A marketing campaign must carry a non-empty name. */
export class EmptyCampaignNameError extends PlatformError {
  constructor() {
    super("A marketing campaign must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The marketing-campaign code is already in use within the tenant. */
export class DuplicateCampaignCodeError extends PlatformError {
  constructor(code: string) {
    super(`Marketing-campaign code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid marketing-campaign status transition was attempted. */
export class InvalidCampaignTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A marketing campaign cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Lead ------------------------------------------------------------------------

/** The requested lead does not exist in the current tenant. */
export class LeadNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Lead "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A lead must carry a non-empty code. */
export class EmptyLeadCodeError extends PlatformError {
  constructor() {
    super("A lead must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A lead must carry a non-empty contact name. */
export class EmptyLeadContactNameError extends PlatformError {
  constructor() {
    super("A lead must have a non-empty contact name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The lead code is already in use within the tenant. */
export class DuplicateLeadCodeError extends PlatformError {
  constructor(code: string) {
    super(`Lead code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid lead status transition was attempted. */
export class InvalidLeadTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A lead cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Admission cycle -------------------------------------------------------------

/** The requested admission cycle does not exist in the current tenant. */
export class CycleNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Admission cycle "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An admission cycle must carry a non-empty code. */
export class EmptyCycleCodeError extends PlatformError {
  constructor() {
    super("An admission cycle must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An admission cycle must carry a non-empty name. */
export class EmptyCycleNameError extends PlatformError {
  constructor() {
    super("An admission cycle must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The admission-cycle code is already in use within the tenant. */
export class DuplicateCycleCodeError extends PlatformError {
  constructor(code: string) {
    super(`Admission-cycle code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** A seat capacity must be a non-negative integer. */
export class InvalidSeatCapacityError extends PlatformError {
  constructor(value: number) {
    super(`Seat capacity "${value}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** An invalid admission-cycle status transition was attempted. */
export class InvalidCycleTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An admission cycle cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The admission cycle is not open, so an application cannot be submitted to it. */
export class CycleNotOpenError extends PlatformError {
  constructor(id: string) {
    super(`Admission cycle "${id}" is not open; an application cannot be submitted to it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Application -----------------------------------------------------------------

/** The requested application does not exist in the current tenant. */
export class ApplicationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Application "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An application must carry a non-empty code. */
export class EmptyApplicationCodeError extends PlatformError {
  constructor() {
    super("An application must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The application code is already in use within the tenant. */
export class DuplicateApplicationCodeError extends PlatformError {
  constructor(code: string) {
    super(`Application code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid application status transition was attempted. */
export class InvalidApplicationTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An application cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Admission evaluation --------------------------------------------------------

/** An evaluation score must be an integer in 0–100. */
export class InvalidEvaluationScoreError extends PlatformError {
  constructor(value: number) {
    super(`Evaluation score "${value}" must be an integer in 0–100`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** The application is not in a state that accepts an entrance evaluation. */
export class ApplicationNotEvaluableError extends PlatformError {
  constructor(id: string) {
    super(`Application "${id}" is not under review; an evaluation cannot be recorded for it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Offer -----------------------------------------------------------------------

/** The requested offer does not exist in the current tenant. */
export class OfferNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Offer "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An invalid offer status transition was attempted. */
export class InvalidOfferTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An offer cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** An offer can only be extended for an application that has reached the `offered` state. */
export class ApplicationNotInOfferStateError extends PlatformError {
  constructor(id: string) {
    super(`Application "${id}" has not reached the offered state; an offer cannot be extended`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** An offer already exists for this application — offers are one per application. */
export class OfferAlreadyExistsError extends PlatformError {
  constructor(applicationId: string) {
    super(`An offer already exists for application "${applicationId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { applicationId },
    });
  }
}

// --- Enrollment confirmation -----------------------------------------------------

/** An enrollment can only be confirmed from an accepted offer. */
export class OfferNotAcceptedError extends PlatformError {
  constructor(id: string) {
    super(`Offer "${id}" is not accepted; enrollment cannot be confirmed from it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** Enrollment has already been confirmed for this offer — confirmations are one per offer. */
export class DuplicateEnrollmentConfirmationError extends PlatformError {
  constructor(offerId: string) {
    super(`Enrollment has already been confirmed for offer "${offerId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { offerId },
    });
  }
}
