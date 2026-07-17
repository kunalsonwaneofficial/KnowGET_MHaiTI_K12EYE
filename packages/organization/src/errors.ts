import { PlatformError } from "@knowget/exceptions";

/** Requested organization does not exist (in the current tenant). */
export class OrganizationNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Organization "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** An organization code must be unique within its tenant. */
export class DuplicateOrganizationCodeError extends PlatformError {
  constructor(code: string) {
    super(`An organization with code "${code}" already exists`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { code },
    });
  }
}

/** Reparenting would create a cycle in the hierarchy. */
export class CircularHierarchyError extends PlatformError {
  constructor() {
    super("The requested parent would create a cycle in the organization hierarchy", {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
    });
  }
}

/** The requested status transition is not permitted. */
export class InvalidStatusTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition organization from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}
