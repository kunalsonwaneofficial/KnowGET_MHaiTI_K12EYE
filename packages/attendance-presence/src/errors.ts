import { PlatformError } from "@knowget/exceptions";

// --- Cross-domain directory errors -----------------------------------------------
// Every attendance record is owned by an Organization (P2-D01-M01) and references
// participants (Person, P2-D01-M02), schedule slots (P2-D07) and academic structure
// (P2-D06) through injected directory ports, so the pure package never depends on those
// domain packages directly.

/** The organization an attendance record belongs to does not exist in the tenant. */
export class OrganizationNotFoundForAttendanceError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The participant (a Person: student, teacher or staff) does not exist in the tenant. */
export class ParticipantNotFoundForAttendanceError extends PlatformError {
  constructor(participantId: string) {
    super(`Participant "${participantId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { participantId },
    });
  }
}

/** The schedule slot an academic session binds to does not exist in the tenant (P2-D07). */
export class ScheduleSlotNotFoundForAttendanceError extends PlatformError {
  constructor(scheduleSlotId: string) {
    super(`Schedule slot "${scheduleSlotId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { scheduleSlotId },
    });
  }
}

/** The section a session references does not exist in the tenant (P2-D06). */
export class SectionNotFoundForAttendanceError extends PlatformError {
  constructor(sectionId: string) {
    super(`Section "${sectionId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { sectionId },
    });
  }
}

/** The subject a session references does not exist in the tenant (P2-D06). */
export class SubjectNotFoundForAttendanceError extends PlatformError {
  constructor(subjectId: string) {
    super(`Subject "${subjectId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { subjectId },
    });
  }
}

// --- Attendance session errors ---------------------------------------------------

/** The requested attendance session does not exist in the current tenant. */
export class AttendanceSessionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Attendance session "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An academic session already exists for this schedule slot on this date. */
export class DuplicateAttendanceSessionError extends PlatformError {
  constructor(scheduleSlotId: string, date: string) {
    super(`An attendance session already exists for slot "${scheduleSlotId}" on ${date}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { scheduleSlotId, date },
    });
  }
}

/** An attendance session field (title, date) must carry a non-empty value. */
export class EmptyAttendanceSessionFieldError extends PlatformError {
  constructor(field: string) {
    super(`An attendance session must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The session is not in a state from which the attempted transition is allowed. */
export class AttendanceSessionStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Attendance session "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Attendance record errors ----------------------------------------------------

/** The requested attendance record does not exist in the current tenant. */
export class AttendanceRecordNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Attendance record "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The session already has a record for this participant. */
export class DuplicateAttendanceRecordError extends PlatformError {
  constructor(sessionId: string, participantId: string) {
    super(`Session "${sessionId}" already has a record for participant "${participantId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { sessionId, participantId },
    });
  }
}

/** A correction must record a reason and must change the status. */
export class InvalidAttendanceCorrectionError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid attendance correction: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

// --- Leave errors ----------------------------------------------------------------

/** The requested leave does not exist in the current tenant. */
export class LeaveNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Leave "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A leave date range ends before it starts. */
export class InvalidLeaveRangeError extends PlatformError {
  constructor(fromDate: string, toDate: string) {
    super(`Leave range end "${toDate}" precedes start "${fromDate}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { fromDate, toDate },
    });
  }
}

/** A leave field (reason) must carry a non-empty value. */
export class EmptyLeaveFieldError extends PlatformError {
  constructor(field: string) {
    super(`A leave request must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The leave is not in a state from which the attempted transition is allowed. */
export class LeaveStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Leave "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Attendance policy errors ----------------------------------------------------

/** The requested attendance policy does not exist in the current tenant. */
export class AttendancePolicyNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Attendance policy "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has an attendance policy with this code. */
export class DuplicateAttendancePolicyError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(`Organization "${organizationId}" already has an attendance policy with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, code },
    });
  }
}

/** An attendance policy field (code, name, revision note) must be non-empty. */
export class EmptyAttendancePolicyFieldError extends PlatformError {
  constructor(field: string) {
    super(`An attendance policy must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** An archived attendance policy is immutable. */
export class AttendancePolicyArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Attendance policy "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Presence profile errors -----------------------------------------------------

/** The requested presence profile does not exist in the current tenant. */
export class PresenceProfileNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Presence profile "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A participant already has a presence profile. */
export class DuplicatePresenceProfileError extends PlatformError {
  constructor(participantId: string) {
    super(`Participant "${participantId}" already has a presence profile`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { participantId },
    });
  }
}

// --- Participation errors --------------------------------------------------------

/** The requested participation record does not exist in the current tenant. */
export class ParticipationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Participation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A participation field (activity name) must carry a non-empty value. */
export class EmptyParticipationFieldError extends PlatformError {
  constructor(field: string) {
    super(`A participation record must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}
