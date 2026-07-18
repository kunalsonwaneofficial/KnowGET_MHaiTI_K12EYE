import { PlatformError } from "@knowget/exceptions";

/** Requested person does not exist in the current tenant. */
export class PersonNotFoundError extends PlatformError {
  constructor(id: string) {
    super(`Person "${id}" not found`, {
      code: "NOT_FOUND",
      httpStatus: 404,
      isOperational: true,
      details: { id },
    });
  }
}

/** A person with the same identity match key already exists (likely duplicate). */
export class DuplicatePersonError extends PlatformError {
  constructor(matchKey: string) {
    super("A person with the same name and date of birth already exists", {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { matchKey },
    });
  }
}

/** The requested status transition is not permitted. */
export class InvalidPersonStatusTransitionError extends PlatformError {
  constructor(from: string, to: string) {
    super(`Cannot transition person from "${from}" to "${to}"`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { from, to },
    });
  }
}

/** The requested merge is not allowed (e.g. into itself, or a merged record). */
export class CannotMergePersonError extends PlatformError {
  constructor(reason: string) {
    super(`Cannot merge person: ${reason}`, {
      code: "CONFLICT",
      httpStatus: 409,
      isOperational: true,
      details: { reason },
    });
  }
}
