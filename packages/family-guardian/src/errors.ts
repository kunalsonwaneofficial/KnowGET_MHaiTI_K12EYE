import { PlatformError } from "@knowget/exceptions";

// --- Shared directory errors -----------------------------------------------------

/**
 * A person referenced by a family record does not exist in the tenant. Guardians and
 * household members are always a Person (P2-D01-M02); the platform links identity and
 * never duplicates it.
 */
export class PersonNotFoundForFamilyError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

/** The organization (campus / institution node) a family registers at does not exist. */
export class OrganizationNotFoundForFamilyError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot register the family to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The student a guardian is being related to does not exist in the tenant (P2-D03). */
export class StudentNotFoundForFamilyError extends PlatformError {
  constructor(studentId: string) {
    super(`Student "${studentId}" not found in this tenant`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { studentId },
    });
  }
}

// --- Family errors ---------------------------------------------------------------

/** The requested family does not exist in the current tenant. */
export class FamilyNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Family "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A family must carry a non-empty family number. */
export class EmptyFamilyNumberError extends PlatformError {
  constructor() {
    super("A family must have a non-empty family number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** A family must carry a non-empty household name. */
export class EmptyFamilyNameError extends PlatformError {
  constructor() {
    super("A family must have a non-empty name", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The family number is already in use within the tenant. */
export class DuplicateFamilyNumberError extends PlatformError {
  constructor(familyNumber: string) {
    super(`Family number "${familyNumber}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { familyNumber },
    });
  }
}

/** The person is already a member of this household. */
export class DuplicateHouseholdMemberError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" is already a member of this household`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { personId },
    });
  }
}

/** The referenced person is not a member of this household. */
export class HouseholdMemberNotFoundError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" is not a member of this household`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

/** A household address must carry, at minimum, a non-empty first line and city. */
export class IncompleteAddressError extends PlatformError {
  constructor() {
    super("A household address must have a non-empty first line and city", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The referenced address label is not on this household. */
export class AddressNotFoundError extends PlatformError {
  constructor(label: string) {
    super(`Address "${label}" is not on this household`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { label },
    });
  }
}

/** The family is not active and cannot be modified (it was merged, split or archived). */
export class InactiveFamilyError extends PlatformError {
  constructor(status: string) {
    super(`Cannot modify a family in status "${status}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { status },
    });
  }
}

// --- Guardian errors -------------------------------------------------------------

/** The requested guardian does not exist in the current tenant. */
export class GuardianNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Guardian "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A person is already registered as a guardian at this organization. */
export class DuplicateGuardianError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" is already a guardian at this organization`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { personId },
    });
  }
}

/** The requested guardian lifecycle transition is not permitted. */
export class InvalidGuardianTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition guardian from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The requested guardian verification transition is not permitted. */
export class InvalidVerificationTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition guardian verification from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The guardian is archived and can no longer be modified. */
export class GuardianArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Guardian "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/** A guardian contact must carry a non-empty value. */
export class EmptyContactValueError extends PlatformError {
  constructor() {
    super("A guardian contact must have a non-empty value", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The referenced contact is not on this guardian. */
export class GuardianContactNotFoundError extends PlatformError {
  constructor(value: string) {
    super(`Contact "${value}" is not on this guardian`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { value },
    });
  }
}

// --- Student–Guardian relationship errors ---------------------------------------

/** The requested student–guardian relationship does not exist in the current tenant. */
export class RelationshipNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Student–guardian relationship "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** This guardian is already actively linked to this student. */
export class DuplicateRelationshipError extends PlatformError {
  constructor(studentId: string, guardianId: string) {
    super(`Guardian "${guardianId}" is already linked to student "${studentId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId, guardianId },
    });
  }
}

/** The relationship has ended and can no longer be modified. */
export class RelationshipEndedError extends PlatformError {
  constructor(id: string) {
    super(`Student–guardian relationship "${id}" has ended and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

/**
 * Legal responsibility was requested for a guardian that holds no legal authority —
 * custody validation. Grant the guardian a legal authority first.
 */
export class CustodyValidationError extends PlatformError {
  constructor(guardianId: string) {
    super(`Guardian "${guardianId}" holds no legal authority; cannot grant legal responsibility`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { guardianId },
    });
  }
}

/** An emergency priority must be a positive integer (1 is highest). */
export class InvalidEmergencyPriorityError extends PlatformError {
  constructor(priority: number) {
    super(`Emergency priority "${priority}" must be a positive integer`, {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
      details: { priority },
    });
  }
}

// --- Consent errors --------------------------------------------------------------

/** The requested consent record does not exist in the current tenant. */
export class ConsentNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Consent "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** There is no active consent of this type to withdraw. */
export class NoConsentToWithdrawError extends PlatformError {
  constructor(consentType: string) {
    super(`No "${consentType}" consent has been granted to withdraw`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { consentType },
    });
  }
}

/** The latest consent of this type has already been withdrawn. */
export class ConsentAlreadyWithdrawnError extends PlatformError {
  constructor(consentType: string) {
    super(`"${consentType}" consent has already been withdrawn`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { consentType },
    });
  }
}

/** A consent's expiry date must not precede the date it takes effect. */
export class InvalidConsentPeriodError extends PlatformError {
  constructor() {
    super("A consent's expiry date must not precede its effective date", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The policy a consent is linked to does not exist in the tenant (P2-D02). */
export class PolicyNotFoundForConsentError extends PlatformError {
  constructor(policyId: string) {
    super(`Policy "${policyId}" not found; cannot link the consent to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { policyId },
    });
  }
}

// --- Emergency contact errors ----------------------------------------------------

/** The requested emergency contact does not exist in the current tenant. */
export class EmergencyContactNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Emergency contact "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** Another active emergency contact for this student already holds this priority. */
export class DuplicateEmergencyPriorityError extends PlatformError {
  constructor(studentId: string, priority: number) {
    super(`Priority "${priority}" is already assigned for student "${studentId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { studentId, priority },
    });
  }
}

/** An emergency contact must carry a non-empty relationship label. */
export class EmptyEmergencyRelationshipError extends PlatformError {
  constructor() {
    super("An emergency contact must have a non-empty relationship label", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The emergency contact is archived and can no longer be modified. */
export class EmergencyContactArchivedError extends PlatformError {
  constructor(id: string) {
    super(`Emergency contact "${id}" is archived and cannot be modified`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}
