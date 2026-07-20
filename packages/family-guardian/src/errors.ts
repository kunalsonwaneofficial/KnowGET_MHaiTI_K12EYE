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
