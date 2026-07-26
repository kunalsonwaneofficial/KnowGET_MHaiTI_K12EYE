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
