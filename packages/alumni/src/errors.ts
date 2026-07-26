import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/** The organization (institution node, P2-D01-M01) an alumni record attaches to does not exist. */
export class OrganizationNotFoundForAlumniError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the alumni record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The person (P2-D01-M02) an alumnus references does not exist. */
export class PersonNotFoundForAlumniError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

// --- Alumni profile --------------------------------------------------------------

/** The requested alumni profile does not exist in the current tenant. */
export class AlumniProfileNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Alumni profile "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An alumni profile must carry a non-empty graduation year. */
export class EmptyGraduationYearError extends PlatformError {
  constructor() {
    super("An alumni profile must have a non-empty graduation year", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A network profile already exists for this alumnus — profiles are one per person per tenant. */
export class DuplicateAlumniProfileError extends PlatformError {
  constructor(alumnusPersonId: string) {
    super(`An alumni profile already exists for person "${alumnusPersonId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { alumnusPersonId },
    });
  }
}

/** An invalid alumni-profile status transition was attempted. */
export class InvalidAlumniTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An alumni profile cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Alumni chapter --------------------------------------------------------------

/** The requested alumni chapter does not exist in the current tenant. */
export class ChapterNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Alumni chapter "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An alumni chapter must carry a non-empty code. */
export class EmptyChapterCodeError extends PlatformError {
  constructor() {
    super("An alumni chapter must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An alumni chapter must carry a non-empty name. */
export class EmptyChapterNameError extends PlatformError {
  constructor() {
    super("An alumni chapter must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The alumni-chapter code is already in use within the tenant. */
export class DuplicateChapterCodeError extends PlatformError {
  constructor(code: string) {
    super(`Alumni-chapter code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid alumni-chapter status transition was attempted. */
export class InvalidChapterTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An alumni chapter cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
