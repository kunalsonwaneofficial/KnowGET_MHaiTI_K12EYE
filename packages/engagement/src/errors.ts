import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/** The organization (institution node, P2-D01-M01) an engagement record attaches to does not exist. */
export class OrganizationNotFoundForEngagementError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the engagement record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The person (P2-D01-M02) an author / participant / respondent references does not exist. */
export class PersonNotFoundForEngagementError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

// --- Audience --------------------------------------------------------------------

/** The requested audience does not exist in the current tenant. */
export class AudienceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Audience "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An audience must carry a non-empty code. */
export class EmptyAudienceCodeError extends PlatformError {
  constructor() {
    super("An audience must have a non-empty code", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An audience must carry a non-empty name. */
export class EmptyAudienceNameError extends PlatformError {
  constructor() {
    super("An audience must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The audience code is already in use within the tenant. */
export class DuplicateAudienceCodeError extends PlatformError {
  constructor(code: string) {
    super(`Audience code "${code}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** An invalid audience status transition was attempted. */
export class InvalidAudienceTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An audience cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The audience is archived and cannot be targeted by a new announcement or survey. */
export class AudienceNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Audience "${id}" is archived; it cannot be targeted by a new announcement or survey`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Announcement ----------------------------------------------------------------

/** The requested announcement does not exist in the current tenant. */
export class AnnouncementNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Announcement "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An announcement must carry a non-empty title. */
export class EmptyAnnouncementTitleError extends PlatformError {
  constructor() {
    super("An announcement must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An announcement must carry a non-empty body. */
export class EmptyAnnouncementBodyError extends PlatformError {
  constructor() {
    super("An announcement must have a non-empty body", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An invalid announcement status transition was attempted. */
export class InvalidAnnouncementTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`An announcement cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Acknowledgement receipt -----------------------------------------------------

/** Only a published announcement can be acknowledged. */
export class AnnouncementNotPublishedError extends PlatformError {
  constructor(id: string) {
    super(`Announcement "${id}" is not published; it cannot be acknowledged`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A person has already acknowledged this announcement — receipts are one per (announcement, person). */
export class DuplicateAcknowledgementError extends PlatformError {
  constructor(announcementId: string, personId: string) {
    super(`Person "${personId}" has already acknowledged announcement "${announcementId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { announcementId, personId },
    });
  }
}

// --- Message thread --------------------------------------------------------------

/** The requested message thread does not exist in the current tenant. */
export class MessageThreadNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Message thread "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A message thread must carry a non-empty subject. */
export class EmptyThreadSubjectError extends PlatformError {
  constructor() {
    super("A message thread must have a non-empty subject", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A message thread must have at least two distinct participants. */
export class InsufficientThreadParticipantsError extends PlatformError {
  constructor() {
    super("A message thread must have at least two distinct participants", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** An invalid message-thread status transition was attempted. */
export class InvalidThreadTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A message thread cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The thread is not open, so it cannot accept a new message. */
export class ThreadNotOpenError extends PlatformError {
  constructor(id: string) {
    super(`Message thread "${id}" is not open; it cannot accept a new message`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The author is not a participant of the thread they are posting to. */
export class NonParticipantAuthorError extends PlatformError {
  constructor(threadId: string, personId: string) {
    super(`Person "${personId}" is not a participant of thread "${threadId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { threadId, personId },
    });
  }
}

// --- Message ---------------------------------------------------------------------

/** The requested message does not exist in the current tenant. */
export class MessageNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Message "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A message must carry a non-empty body. */
export class EmptyMessageBodyError extends PlatformError {
  constructor() {
    super("A message must have a non-empty body", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

// --- Survey ----------------------------------------------------------------------

/** The requested survey does not exist in the current tenant. */
export class SurveyNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Survey "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A survey must carry a non-empty title. */
export class EmptySurveyTitleError extends PlatformError {
  constructor() {
    super("A survey must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/**
 * A survey's questions are invalid — empty set, a blank/duplicate question key, or a choice-type question
 * without at least two options.
 */
export class InvalidSurveyQuestionsError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid survey questions: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

/** An invalid survey status transition was attempted. */
export class InvalidSurveyTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`A survey cannot move from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The survey is not open, so it cannot accept a response. */
export class SurveyNotOpenError extends PlatformError {
  constructor(id: string) {
    super(`Survey "${id}" is not open; it cannot accept a response`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Survey response -------------------------------------------------------------

/** The requested survey response does not exist in the current tenant. */
export class SurveyResponseNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Survey response "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A survey response references a question the survey does not define. */
export class UnknownSurveyQuestionError extends PlatformError {
  constructor(questionKey: string) {
    super(`Survey response references unknown question "${questionKey}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { questionKey },
    });
  }
}

/** A person has already responded to this survey — responses are one per (survey, respondent). */
export class DuplicateSurveyResponseError extends PlatformError {
  constructor(surveyId: string, respondentPersonId: string) {
    super(`Person "${respondentPersonId}" has already responded to survey "${surveyId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { surveyId, respondentPersonId },
    });
  }
}

// --- Engagement profile ----------------------------------------------------------

/** The requested engagement profile does not exist in the current tenant. */
export class EngagementProfileNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Engagement profile "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}
