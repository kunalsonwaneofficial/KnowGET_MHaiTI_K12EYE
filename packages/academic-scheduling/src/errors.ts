import { PlatformError } from "@knowget/exceptions";

// --- Cross-domain directory errors -----------------------------------------------
// Every scheduling record is owned by an Organization (P2-D01-M01) and references
// academic-structure entities (P2-D06) and teachers (Person, P2-D01-M02) through injected
// directory ports, so the pure package never depends on those domain packages directly.

/** The organization a scheduling record belongs to does not exist in the tenant. */
export class OrganizationNotFoundForSchedulingError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The grade a timetable is scheduled for does not exist in the tenant (P2-D06). */
export class GradeNotFoundForSchedulingError extends PlatformError {
  constructor(gradeId: string) {
    super(`Grade "${gradeId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { gradeId },
    });
  }
}

/** The class a timetable or slot references does not exist in the tenant (P2-D06). */
export class ClassNotFoundForSchedulingError extends PlatformError {
  constructor(classId: string) {
    super(`Class "${classId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { classId },
    });
  }
}

/** The section a timetable or slot references does not exist in the tenant (P2-D06). */
export class SectionNotFoundForSchedulingError extends PlatformError {
  constructor(sectionId: string) {
    super(`Section "${sectionId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { sectionId },
    });
  }
}

/** The subject a slot teaches does not exist in the tenant (P2-D06). */
export class SubjectNotFoundForSchedulingError extends PlatformError {
  constructor(subjectId: string) {
    super(`Subject "${subjectId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { subjectId },
    });
  }
}

/** The teacher a slot, allocation or substitution references does not exist (Person). */
export class TeacherNotFoundForSchedulingError extends PlatformError {
  constructor(teacherId: string) {
    super(`Teacher "${teacherId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { teacherId },
    });
  }
}

// --- Timetable errors ------------------------------------------------------------

/** The requested timetable does not exist in the current tenant. */
export class TimetableNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Timetable "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has a timetable with this code. */
export class DuplicateTimetableError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(`Organization "${organizationId}" already has a timetable with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, code },
    });
  }
}

/** A timetable field (code, name, academic year) must carry a non-empty value. */
export class EmptyTimetableFieldError extends PlatformError {
  constructor(field: string) {
    super(`A timetable must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The timetable is not in a state from which the attempted transition is allowed. */
export class TimetableStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Timetable "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

/**
 * Publication (or revision-publish) was rejected because the schedule is invalid: the
 * conflict engine detected one or more conflicts. The offending conflicts travel in
 * `details.conflicts` so callers can surface exactly what must be resolved.
 */
export class ScheduleConflictError extends PlatformError {
  constructor(timetableId: string, conflicts: readonly unknown[]) {
    super(
      `Timetable "${timetableId}" cannot be published: ${conflicts.length} scheduling conflict(s) detected`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { timetableId, conflicts },
      },
    );
  }
}

// --- Schedule slot errors --------------------------------------------------------

/** The requested schedule slot does not exist in the current tenant. */
export class ScheduleSlotNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Schedule slot "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The timetable already has a slot for this section at this day and start time. */
export class DuplicateScheduleSlotError extends PlatformError {
  constructor(timetableId: string, day: string, startsAt: string, sectionId: string) {
    super(
      `Timetable "${timetableId}" already has a slot for section "${sectionId}" on ${day} at ${startsAt}`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { timetableId, day, startsAt, sectionId },
      },
    );
  }
}

/** A time value is not a valid 24-hour `HH:MM` string. */
export class InvalidTimeError extends PlatformError {
  constructor(value: string) {
    super(`"${value}" is not a valid HH:MM time of day`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { value },
    });
  }
}

/** A time range ends at or before it starts. */
export class InvalidTimeRangeError extends PlatformError {
  constructor(startsAt: string, endsAt: string) {
    super(`Time range end "${endsAt}" must be after start "${startsAt}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { startsAt, endsAt },
    });
  }
}

// --- Resource errors -------------------------------------------------------------

/** The requested resource does not exist in the current tenant. */
export class ResourceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Resource "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has a resource with this code. */
export class DuplicateResourceError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(`Organization "${organizationId}" already has a resource with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, code },
    });
  }
}

/** A resource field (code, name) must carry a non-empty value. */
export class EmptyResourceFieldError extends PlatformError {
  constructor(field: string) {
    super(`A resource must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** A resource capacity must be a non-negative integer. */
export class InvalidResourceCapacityError extends PlatformError {
  constructor(capacity: number) {
    super(`Resource capacity must be a non-negative integer, got ${capacity}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { capacity },
    });
  }
}

/** A retired resource cannot be allocated or modified. */
export class ResourceRetiredError extends PlatformError {
  constructor(id: string) {
    super(`Resource "${id}" is retired`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Allocation errors -----------------------------------------------------------

/** The requested allocation does not exist in the current tenant. */
export class AllocationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Allocation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested occupancy exceeds the resource's capacity. */
export class CapacityExceededError extends PlatformError {
  constructor(resourceId: string, capacity: number, requested: number) {
    super(`Resource "${resourceId}" has capacity ${capacity} but ${requested} was requested`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { resourceId, capacity, requested },
    });
  }
}

/** The allocation has already been released. */
export class AllocationAlreadyReleasedError extends PlatformError {
  constructor(id: string) {
    super(`Allocation "${id}" has already been released`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Scheduling policy errors ----------------------------------------------------

/** The requested scheduling policy does not exist in the current tenant. */
export class SchedulingPolicyNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Scheduling policy "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has a scheduling policy with this code. */
export class DuplicateSchedulingPolicyError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(`Organization "${organizationId}" already has a scheduling policy with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, code },
    });
  }
}

/** A scheduling policy field (code, name, revision note) must be non-empty. */
export class EmptySchedulingPolicyFieldError extends PlatformError {
  constructor(field: string) {
    super(`A scheduling policy must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** An archived scheduling policy is immutable. */
export class SchedulingPolicyArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Scheduling policy "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Substitution errors ---------------------------------------------------------

/** The requested substitution does not exist in the current tenant. */
export class SubstitutionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Substitution "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A substitution's replacement must differ from the original teacher/venue. */
export class InvalidSubstitutionError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid substitution: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}

/** The substitution is not in a state from which the attempted transition is allowed. */
export class SubstitutionStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Substitution "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}
