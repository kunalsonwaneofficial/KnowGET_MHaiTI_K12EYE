import { PlatformError } from "@knowget/exceptions";

// --- Directories -----------------------------------------------------------------

/**
 * The organization (campus / institution node, P2-D01-M01) a library record attaches to does not exist
 * in the tenant. Titles, copies, members and loans belong to an organization; the domain links to it.
 */
export class OrganizationNotFoundForLibraryError extends PlatformError {
  constructor(organizationId: string) {
    super(`Organization "${organizationId}" not found; cannot attach the library record to it`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { organizationId },
    });
  }
}

/** The person (P2-D01-M02) a library member links to does not exist in the tenant. */
export class PersonNotFoundForLibraryError extends PlatformError {
  constructor(personId: string) {
    super(`Person "${personId}" not found; cannot register the library member`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { personId },
    });
  }
}

// --- Title -----------------------------------------------------------------------

/** The requested title does not exist in the current tenant. */
export class TitleNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Title "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A title must carry a non-empty title. */
export class EmptyTitleError extends PlatformError {
  constructor() {
    super("A catalog title must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The ISBN is already in use within the tenant. */
export class DuplicateIsbnError extends PlatformError {
  constructor(isbn: string) {
    super(`ISBN "${isbn}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { isbn },
    });
  }
}

/** The requested title lifecycle transition is not permitted. */
export class InvalidTitleTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition title from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The title is not active, so it cannot take copies. */
export class TitleNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Title "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Copy ------------------------------------------------------------------------

/** The requested copy does not exist in the current tenant. */
export class CopyNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Copy "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A copy must carry a non-empty barcode. */
export class EmptyBarcodeError extends PlatformError {
  constructor() {
    super("A copy must have a non-empty barcode", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The barcode is already in use within the tenant. */
export class DuplicateBarcodeError extends PlatformError {
  constructor(barcode: string) {
    super(`Copy barcode "${barcode}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { barcode },
    });
  }
}

/** The requested copy lifecycle transition is not permitted. */
export class InvalidCopyTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition copy from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The copy is not available, so it cannot be issued on loan. */
export class CopyNotAvailableError extends PlatformError {
  constructor(id: string) {
    super(`Copy "${id}" is not available`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}

// --- Digital asset ---------------------------------------------------------------

/** The requested digital asset does not exist in the current tenant. */
export class DigitalAssetNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Digital asset "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A digital asset must carry a non-empty title. */
export class EmptyDigitalTitleError extends PlatformError {
  constructor() {
    super("A digital asset must have a non-empty title", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The requested digital asset lifecycle transition is not permitted. */
export class InvalidDigitalTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition digital asset from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

// --- Library member --------------------------------------------------------------

/** The requested library member does not exist in the current tenant. */
export class MemberNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Library member "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A library member must carry a non-empty membership number. */
export class EmptyMembershipNumberError extends PlatformError {
  constructor() {
    super("A library member must have a non-empty membership number", {
      code: "VALIDATION_ERROR",
      httpStatus: 422,
      isOperational: true,
    });
  }
}

/** The membership number is already in use within the tenant. */
export class DuplicateMembershipNumberError extends PlatformError {
  constructor(membershipNumber: string) {
    super(`Membership number "${membershipNumber}" is already in use`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { membershipNumber },
    });
  }
}

/** The person is already a library member in this organization. */
export class DuplicateMemberForPersonError extends PlatformError {
  constructor(personId: string, organizationId: string) {
    super(`Person "${personId}" is already a library member in organization "${organizationId}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { personId, organizationId },
    });
  }
}

/** The requested member lifecycle transition is not permitted. */
export class InvalidMemberTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition library member from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The member is not active, so it cannot borrow or reserve. */
export class MemberNotActiveError extends PlatformError {
  constructor(id: string) {
    super(`Library member "${id}" is not active`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { id },
    });
  }
}
