import { PlatformError } from "@knowget/exceptions";

// --- Cross-domain directory errors -----------------------------------------------
// Every teaching-learning record is owned by an Organization (P2-D01-M01) and references
// subjects / sections (P2-D06), schedule slots (P2-D07), students (P2-D03) and teachers
// (Person, P2-D01-M02) through injected directory ports, so the pure package never depends on
// those domain packages directly.

/** The organization a teaching-learning record belongs to does not exist in the tenant. */
export class OrganizationNotFoundForTeachingError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The subject a plan/lesson/resource/assignment references does not exist (P2-D06). */
export class SubjectNotFoundForTeachingError extends PlatformError {
  constructor(subjectId: string) {
    super(`Subject "${subjectId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { subjectId },
    });
  }
}

/** The curriculum framework a unit plan aligns to does not exist (P2-D06). */
export class CurriculumNotFoundForTeachingError extends PlatformError {
  constructor(curriculumFrameworkId: string) {
    super(`Curriculum framework "${curriculumFrameworkId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { curriculumFrameworkId },
    });
  }
}

/** The section a session/assignment references does not exist (P2-D06). */
export class SectionNotFoundForTeachingError extends PlatformError {
  constructor(sectionId: string) {
    super(`Section "${sectionId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { sectionId },
    });
  }
}

/** The schedule slot a classroom session binds to does not exist (P2-D07). */
export class ScheduleSlotNotFoundForTeachingError extends PlatformError {
  constructor(scheduleSlotId: string) {
    super(`Schedule slot "${scheduleSlotId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { scheduleSlotId },
    });
  }
}

/** The student a piece of learning evidence is about does not exist (P2-D03). */
export class StudentNotFoundForTeachingError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}

// --- Academic plan errors --------------------------------------------------------

/** The requested academic plan does not exist in the current tenant. */
export class AcademicPlanNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Academic plan "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has an academic plan with this code. */
export class DuplicateAcademicPlanError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(`Organization "${organizationId}" already has an academic plan with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, code },
    });
  }
}

/** An academic plan field (title, code) must carry a non-empty value. */
export class EmptyAcademicPlanFieldError extends PlatformError {
  constructor(field: string) {
    super(`An academic plan must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The academic plan is not in a state from which the attempted transition is allowed. */
export class AcademicPlanStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Academic plan "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Unit plan errors ------------------------------------------------------------

/** The requested unit plan does not exist in the current tenant. */
export class UnitPlanNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Unit plan "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A unit plan field (title) must carry a non-empty value. */
export class EmptyUnitPlanFieldError extends PlatformError {
  constructor(field: string) {
    super(`A unit plan must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** An archived unit plan is immutable. */
export class UnitPlanArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Unit plan "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Lesson plan errors ----------------------------------------------------------

/** The requested lesson plan does not exist in the current tenant. */
export class LessonPlanNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Lesson plan "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A lesson plan field (title, revision note) must carry a non-empty value. */
export class EmptyLessonPlanFieldError extends PlatformError {
  constructor(field: string) {
    super(`A lesson plan must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The lesson plan is not in a state from which the attempted transition is allowed. */
export class LessonPlanStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Lesson plan "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

/** An archived lesson plan is immutable. */
export class LessonPlanArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Lesson plan "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Learning resource errors ----------------------------------------------------

/** The requested learning resource does not exist in the current tenant. */
export class LearningResourceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Learning resource "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A learning resource field (title, revision note) must carry a non-empty value. */
export class EmptyLearningResourceFieldError extends PlatformError {
  constructor(field: string) {
    super(`A learning resource must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** An archived learning resource is immutable. */
export class LearningResourceArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Learning resource "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Classroom session errors ----------------------------------------------------

/** The requested classroom session does not exist in the current tenant. */
export class ClassroomSessionNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Classroom session "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A classroom session field (title, date) must carry a non-empty value. */
export class EmptyClassroomSessionFieldError extends PlatformError {
  constructor(field: string) {
    super(`A classroom session must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The classroom session is not in a state from which the attempted transition is allowed. */
export class ClassroomSessionStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Classroom session "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Assignment errors -----------------------------------------------------------

/** The requested assignment does not exist in the current tenant. */
export class AssignmentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Assignment "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An assignment field (title) must carry a non-empty value. */
export class EmptyAssignmentFieldError extends PlatformError {
  constructor(field: string) {
    super(`An assignment must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** An assignment's submission window ends before it starts. */
export class InvalidAssignmentWindowError extends PlatformError {
  constructor(opensAt: string, closesAt: string) {
    super(`Assignment submission window closes "${closesAt}" before it opens "${opensAt}"`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { opensAt, closesAt },
    });
  }
}

/** The assignment is not in a state from which the attempted transition is allowed. */
export class AssignmentStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Assignment "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Learning evidence errors ----------------------------------------------------

/** The requested learning evidence does not exist in the current tenant. */
export class LearningEvidenceNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Learning evidence "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A learning evidence field (title/description) must carry a non-empty value. */
export class EmptyLearningEvidenceFieldError extends PlatformError {
  constructor(field: string) {
    super(`A learning evidence record must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The instructional activity a piece of learning evidence links to does not exist. */
export class InstructionalActivityNotFoundError extends PlatformError {
  constructor(activityKind: string, activityId: string) {
    super(`Instructional activity ${activityKind} "${activityId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { activityKind, activityId },
    });
  }
}
