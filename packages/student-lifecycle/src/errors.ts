import { PlatformError } from "@knowget/exceptions";

/**
 * A person referenced by a lifecycle record does not exist in the tenant. Every
 * learner is a Person (P2-D01-M02); the lifecycle never duplicates identity.
 */
export class PersonNotFoundForLifecycleError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

/** The organization (campus/institution node) a learner attaches to does not exist. */
export class OrganizationNotFoundForLifecycleError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the learner to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The requested prospect does not exist in the current tenant. */
export class ProspectNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Prospect "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested prospect lifecycle transition is not permitted. */
export class InvalidProspectTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition prospect from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A follow-up must carry a non-empty note. */
export class EmptyFollowUpNoteError extends PlatformError {
  constructor() {
    super("A follow-up must have a non-empty note", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requested applicant does not exist in the current tenant. */
export class ApplicantNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Applicant "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested application lifecycle transition is not permitted. */
export class InvalidApplicantTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition application from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A required document must carry a non-empty type. */
export class EmptyDocumentTypeError extends PlatformError {
  constructor() {
    super("A required document must have a non-empty type", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The referenced application document is not on the applicant's checklist. */
export class DocumentNotFoundError extends PlatformError {
  constructor(type: string) {
    super(`Document "${type}" is not on this application's checklist`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { type },
    });
  }
}

/** The membership a student is linked to does not exist in the tenant. */
export class MembershipNotFoundForLifecycleError extends PlatformError {
  constructor(membershipId: string) {
    super(`Membership "${membershipId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { membershipId },
    });
  }
}

/** The requested student does not exist in the current tenant. */
export class StudentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Student "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A student must have a non-empty student number. */
export class EmptyStudentNumberError extends PlatformError {
  constructor() {
    super("A student must have a non-empty student number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The student number is already in use within the tenant. */
export class DuplicateStudentNumberError extends PlatformError {
  constructor(studentNumber: string) {
    super(`Student number "${studentNumber}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentNumber },
    });
  }
}

/** The requested student lifecycle transition is not permitted. */
export class InvalidStudentTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition student from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** A learner may hold at most one active student record per institution. */
export class DuplicateEnrollmentError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" already has an active enrollment at this organization`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { personId },
    });
  }
}
