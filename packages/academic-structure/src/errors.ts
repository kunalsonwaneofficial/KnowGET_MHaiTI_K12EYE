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

// --- Curriculum framework errors -------------------------------------------------

/** The requested curriculum framework does not exist in the current tenant. */
export class CurriculumFrameworkNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Curriculum framework "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has a curriculum framework with this code. */
export class DuplicateCurriculumFrameworkError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(`Organization "${organizationId}" already has a curriculum with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, code },
    });
  }
}

/** A curriculum field (name, code, board, revision note) must be non-empty. */
export class EmptyCurriculumFieldError extends PlatformError {
  constructor(field: string) {
    super(`A curriculum framework must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The curriculum framework is archived and cannot be modified or revised. */
export class CurriculumArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Curriculum framework "${id}" is archived`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Grade errors ----------------------------------------------------------------

/** The requested grade does not exist in the current tenant. */
export class GradeNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Grade "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A program already has a grade with this code. */
export class DuplicateGradeError extends PlatformError {
  constructor(programId: string, code: string) {
    super(`Program "${programId}" already has a grade with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { programId, code },
    });
  }
}

/** A grade field (name, code) must carry a non-empty value. */
export class EmptyGradeFieldError extends PlatformError {
  constructor(field: string) {
    super(`A grade must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** A grade's age guideline has a maximum below its minimum. */
export class InvalidAgeRangeError extends PlatformError {
  constructor(minAge: number, maxAge: number) {
    super(`Age range maximum ${maxAge} is below minimum ${minAge}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { minAge, maxAge },
    });
  }
}

// --- Class errors ----------------------------------------------------------------

/** The requested class does not exist in the current tenant. */
export class ClassNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Class "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A grade already has a class with this name for this academic year. */
export class DuplicateClassError extends PlatformError {
  constructor(gradeId: string, academicYear: string, name: string) {
    super(`Grade "${gradeId}" already has a class "${name}" for "${academicYear}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { gradeId, academicYear, name },
    });
  }
}

/** A class field (name, academic year) must carry a non-empty value. */
export class EmptyClassFieldError extends PlatformError {
  constructor(field: string) {
    super(`A class must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

// --- Section errors --------------------------------------------------------------

/** The requested section does not exist in the current tenant. */
export class SectionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Section "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A class already has a section with this name. */
export class DuplicateSectionError extends PlatformError {
  constructor(classId: string, name: string) {
    super(`Class "${classId}" already has a section "${name}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { classId, name },
    });
  }
}

/** A section field (name) must carry a non-empty value. */
export class EmptySectionFieldError extends PlatformError {
  constructor(field: string) {
    super(`A section must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** A section capacity must be a non-negative integer. */
export class InvalidCapacityError extends PlatformError {
  constructor(capacity: number) {
    super(`Section capacity ${capacity} must be a non-negative integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { capacity },
    });
  }
}

/** The section is closed and cannot be modified. */
export class SectionClosedError extends PlatformError {
  constructor(id: string) {
    super(`Section "${id}" is closed`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}
