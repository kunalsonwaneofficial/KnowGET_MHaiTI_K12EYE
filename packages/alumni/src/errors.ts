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

// --- Chapter membership ----------------------------------------------------------

/** The requested chapter membership does not exist in the current tenant. */
export class MembershipNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Chapter membership "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** This alumnus is already an active member of the chapter — memberships are one active per (chapter, alumnus). */
export class DuplicateChapterMembershipError extends PlatformError {
  constructor(chapterId: string, alumniProfileId: string) {
    super(
      `Alumni profile "${alumniProfileId}" is already an active member of chapter "${chapterId}"`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { chapterId, alumniProfileId },
      },
    );
  }
}

/** The chapter is not accepting members (it is inactive or archived). */
export class ChapterNotJoinableError extends PlatformError {
  constructor(id: string) {
    super(`Alumni chapter "${id}" is not accepting members`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** An invalid chapter-membership status transition was attempted. */
export class InvalidMembershipTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A chapter membership cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Alumni event ----------------------------------------------------------------

/** The requested alumni event does not exist in the current tenant. */
export class EventNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Alumni event "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An alumni event must carry a non-empty code. */
export class EmptyEventCodeError extends PlatformError {
  constructor() {
    super("An alumni event must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An alumni event must carry a non-empty name. */
export class EmptyEventNameError extends PlatformError {
  constructor() {
    super("An alumni event must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The alumni-event code is already in use within the tenant. */
export class DuplicateEventCodeError extends PlatformError {
  constructor(code: string) {
    super(`Alumni-event code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An event capacity must be a non-negative integer. */
export class InvalidEventCapacityError extends PlatformError {
  constructor(value: number) {
    super(`Event capacity "${value}" must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** An invalid alumni-event status transition was attempted. */
export class InvalidEventTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An alumni event cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The alumni event is not open, so a registration cannot be taken for it. */
export class EventNotOpenError extends PlatformError {
  constructor(id: string) {
    super(`Alumni event "${id}" is not open; a registration cannot be taken for it`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Event registration ----------------------------------------------------------

/** The requested event registration does not exist in the current tenant. */
export class RegistrationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Event registration "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** This alumnus has already registered for the event — registrations are one per (event, alumnus). */
export class DuplicateRegistrationError extends PlatformError {
  constructor(eventId: string, alumniProfileId: string) {
    super(`Alumni profile "${alumniProfileId}" has already registered for event "${eventId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { eventId, alumniProfileId },
    });
  }
}

/** An invalid event-registration status transition was attempted. */
export class InvalidRegistrationTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An event registration cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Mentorship connection -------------------------------------------------------

/** The requested mentorship connection does not exist in the current tenant. */
export class MentorshipNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Mentorship connection "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A mentorship connection cannot have the same alumnus as both mentor and mentee. */
export class SelfMentorshipError extends PlatformError {
  constructor(alumniProfileId: string) {
    super(`Alumni profile "${alumniProfileId}" cannot mentor themselves`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { alumniProfileId },
    });
  }
}

/** An invalid mentorship status transition was attempted. */
export class InvalidMentorshipTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A mentorship connection cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
