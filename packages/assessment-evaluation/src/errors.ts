import { PlatformError } from "@knowget/exceptions";

// --- Cross-domain directory errors -----------------------------------------------
// Every assessment record is owned by an Organization (P2-D01-M01) and references subjects
// (P2-D06) and students (P2-D03) through injected directory ports, so the pure package never
// depends on those domain packages.

/** The organization an assessment record belongs to does not exist in the tenant. */
export class OrganizationNotFoundForAssessmentError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The subject an assessment / question bank references does not exist (P2-D06). */
export class SubjectNotFoundForAssessmentError extends PlatformError {
  constructor(subjectId: string) {
    super(`Subject "${subjectId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { subjectId },
    });
  }
}

/** The student an evaluation / competency profile / academic record is about does not exist (P2-D03). */
export class StudentNotFoundForAssessmentError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}

// --- Assessment framework errors -------------------------------------------------

/** The requested assessment framework does not exist in the current tenant. */
export class AssessmentFrameworkNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Assessment framework "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has an assessment framework with this code. */
export class DuplicateAssessmentFrameworkError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(
      `Organization "${organizationId}" already has an assessment framework with code "${code}"`,
      {
        code: "CONFLICT",
        httpStatus: 409,
        isOperational: true,
        details: { organizationId, code },
      },
    );
  }
}

/** An assessment framework field (code, name, revision note) must be non-empty. */
export class EmptyAssessmentFrameworkFieldError extends PlatformError {
  constructor(field: string) {
    super(`An assessment framework must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** An archived assessment framework is immutable. */
export class AssessmentFrameworkArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Assessment framework "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Assessment plan errors ------------------------------------------------------

/** The requested assessment plan does not exist in the current tenant. */
export class AssessmentPlanNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Assessment plan "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An assessment plan field (title) must carry a non-empty value. */
export class EmptyAssessmentPlanFieldError extends PlatformError {
  constructor(field: string) {
    super(`An assessment plan must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The assessment plan is not in a state from which the attempted transition is allowed. */
export class AssessmentPlanStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Assessment plan "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Assessment errors -----------------------------------------------------------

/** The requested assessment does not exist in the current tenant. */
export class AssessmentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Assessment "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An assessment field (title) must carry a non-empty value. */
export class EmptyAssessmentFieldError extends PlatformError {
  constructor(field: string) {
    super(`An assessment must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** The assessment is not in a state from which the attempted transition is allowed. */
export class AssessmentStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Assessment "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Question bank errors --------------------------------------------------------

/** The requested question bank does not exist in the current tenant. */
export class QuestionBankNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Question bank "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization already has a question bank with this code. */
export class DuplicateQuestionBankError extends PlatformError {
  constructor(organizationId: string, code: string) {
    super(`Organization "${organizationId}" already has a question bank with code "${code}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { organizationId, code },
    });
  }
}

/** A question bank / question field (title, question text, revision note) must be non-empty. */
export class EmptyQuestionBankFieldError extends PlatformError {
  constructor(field: string) {
    super(`A question bank must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/** An archived question bank is immutable. */
export class QuestionBankArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Question bank "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** The requested question does not exist in the bank. */
export class QuestionNotFoundError extends PlatformError {
  constructor(bankId: string, questionId: string) {
    super(`Question "${questionId}" not found in bank "${bankId}"`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { bankId, questionId },
    });
  }
}

// --- Evaluation errors -----------------------------------------------------------

/** The requested evaluation does not exist in the current tenant. */
export class EvaluationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Evaluation "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** The assessment already has an evaluation for this student. */
export class DuplicateEvaluationError extends PlatformError {
  constructor(assessmentId: string, studentId: string) {
    super(`Assessment "${assessmentId}" already has an evaluation for student "${studentId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { assessmentId, studentId },
    });
  }
}

/** The referenced assessment does not exist for this evaluation. */
export class AssessmentNotFoundForEvaluationError extends PlatformError {
  constructor(assessmentId: string) {
    super(`Assessment "${assessmentId}" not found for evaluation`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { assessmentId },
    });
  }
}

/** The evaluation is not in a state from which the attempted transition is allowed. */
export class EvaluationStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Evaluation "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

// --- Competency profile errors ---------------------------------------------------

/** The requested competency profile does not exist in the current tenant. */
export class CompetencyProfileNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Competency profile "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A student already has a competency profile. */
export class DuplicateCompetencyProfileError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" already has a competency profile`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId },
    });
  }
}

/** A competency field (id, name) must carry a non-empty value. */
export class EmptyCompetencyFieldError extends PlatformError {
  constructor(field: string) {
    super(`A competency must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

// --- Academic record errors ------------------------------------------------------

/** The requested academic record does not exist in the current tenant. */
export class AcademicRecordNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Academic record "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A student already has an academic record for this academic year and term. */
export class DuplicateAcademicRecordError extends PlatformError {
  constructor(studentId: string, academicYear: string, term: string) {
    super(`Student "${studentId}" already has an academic record for ${academicYear} / ${term}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId, academicYear, term },
    });
  }
}

/** An academic record field (academic year) must carry a non-empty value. */
export class EmptyAcademicRecordFieldError extends PlatformError {
  constructor(field: string) {
    super(`An academic record must have a non-empty ${field}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { field },
    });
  }
}

/**
 * A published academic record is immutable — it may only change through the controlled
 * amendment workflow, and a draft-only operation was attempted on a published record (or an
 * amendment on a draft).
 */
export class AcademicRecordStateError extends PlatformError {
  constructor(id: string, expected: string, actual: string) {
    super(`Academic record "${id}" must be ${expected} for this operation (is ${actual})`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id, expected, actual },
    });
  }
}

/** An amendment must record a reason. */
export class InvalidRecordAmendmentError extends PlatformError {
  constructor(reason: string) {
    super(`Invalid academic-record amendment: ${reason}`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { reason },
    });
  }
}
