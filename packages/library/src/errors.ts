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
