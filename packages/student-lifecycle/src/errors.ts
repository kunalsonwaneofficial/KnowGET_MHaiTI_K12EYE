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
