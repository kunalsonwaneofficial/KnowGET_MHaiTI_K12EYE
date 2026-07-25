import { PlatformError } from "@knowget/exceptions";

// --- Shared directory errors -----------------------------------------------------

/**
 * The organization an academic-structure record belongs to does not exist in the tenant
 * (P2-D01-M01). Every calendar, program, curriculum, grade, class, section, subject and
 * learning outcome is owned by an Organization; the platform validates it and never
 * depends on `@knowget/organization` directly.
 */
export class OrganizationNotFoundForAcademicError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

// --- Academic calendar errors ----------------------------------------------------

/** The requested academic calendar does not exist in the current tenant. */
export class AcademicCalendarNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Academic calendar "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has a calendar for this academic year. */
export class DuplicateAcademicCalendarError extends PlatformError {
  constructor(organizationId: string, academicYear: string) {
    super(`Organization "${organizationId}" already has a calendar for "${academicYear}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, academicYear },
    });
  }
}

/** A calendar entry (year, term, holiday, period, event) must carry a non-empty value. */
export class EmptyCalendarEntryError extends PlatformError {
  constructor(field: string) {
    super(`A calendar entry must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** A date range on the calendar ends before it starts. */
export class InvalidDateRangeError extends PlatformError {
  constructor(startDate: string, endDate: string) {
    super(`Date range end "${endDate}" precedes start "${startDate}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { startDate, endDate },
    });
  }
}

/** The calendar cannot be published because it is not a draft. */
export class CalendarNotDraftError extends PlatformError {
  constructor(id: string) {
    super(`Academic calendar "${id}" is not a draft`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The referenced term is not on this calendar. */
export class TermNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Term "${id}" is not on this calendar`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The referenced holiday is not on this calendar. */
export class HolidayNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Holiday "${id}" is not on this calendar`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The referenced examination period is not on this calendar. */
export class ExaminationPeriodNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Examination period "${id}" is not on this calendar`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The referenced academic event is not on this calendar. */
export class AcademicEventNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Academic event "${id}" is not on this calendar`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Academic program errors -----------------------------------------------------

/** The requested academic program does not exist in the current tenant. */
export class AcademicProgramNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Academic program "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has a program with this code. */
export class DuplicateAcademicProgramError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(`Organization "${organizationId}" already has a program with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, code },
    });
  }
}

/** A program field (name, code) must carry a non-empty value. */
export class EmptyProgramFieldError extends PlatformError {
  constructor(field: string) {
    super(`An academic program must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}
